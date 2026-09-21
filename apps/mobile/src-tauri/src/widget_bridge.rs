//! iOS 主屏小组件的数据桥。
//!
//! WidgetKit extension 与主 App 是两个沙盒，唯一合法的共享通道是
//! App Group 容器。WKWebView 里的 JS 摸不到原生文件系统，所以由
//! Tauri command（本模块）代写：JS 生成快照 JSON → invoke 本命令 →
//! 原子写入 group.com.tt.calendar.mobile/widget-snapshot.json →
//! extension 读同一文件。
//!
//! 实现走 ObjC runtime 直调，零第三方依赖（不引 objc2 是为了避免与 tauri
//! 依赖树里的 objc2 版本打架）。
//!
//! ⚠️ objc_msgSend 是**可变参数**函数：同一条符号按不同签名重复声明会触发
//! rustc 的 "signature doesn't match the previous declaration" 硬错误
//! （2026-09-15 本地类型检查发现）。这里只声明一次，再按调用点 transmute 成
//! 具体签名——arm64 上 objc_msgSend 走固定寄存器传参，这种做法是标准且安全的。

#[cfg(target_os = "ios")]
pub fn write_shared_snapshot(content: &str) -> Result<String, String> {
    use std::ffi::{c_char, CStr, CString};
    use std::mem::transmute;

    const GROUP_ID: &str = "group.com.tt.calendar.mobile";
    const FILE_NAME: &str = "widget-snapshot.json";

    #[repr(C)]
    struct ObjCObject {
        _private: [u8; 0],
    }

    #[repr(C)]
    struct ObjCSelector {
        _private: [u8; 0],
    }

    type MsgSendToObject = unsafe extern "C" fn(*mut ObjCObject, *mut ObjCSelector) -> *mut ObjCObject;
    type MsgSendToObjectWithObject =
        unsafe extern "C" fn(*mut ObjCObject, *mut ObjCSelector, *mut ObjCObject) -> *mut ObjCObject;
    type MsgSendToObjectWithCStr =
        unsafe extern "C" fn(*mut ObjCObject, *mut ObjCSelector, *const c_char) -> *mut ObjCObject;
    type MsgSendToCStr = unsafe extern "C" fn(*mut ObjCObject, *mut ObjCSelector) -> *const c_char;

    extern "C" {
        // 原始符号：可变参数，必须先声明成无签名形式再按调用点转型
        fn objc_msgSend();
        fn objc_getClass(name: *const c_char) -> *mut ObjCObject;
        fn sel_registerName(name: *const c_char) -> *mut ObjCSelector;
        // 自动释放池：本命令跑在 Tauri 工作线程（无 runloop、系统不会自动建池），
        // stringWithUTF8String / containerURLFor… 返回的都是 autorelease 对象，
        // 不建池就会随每次调用泄漏（15 分钟一次量很小，但属卫生问题）。
        fn objc_autoreleasePoolPush() -> *mut core::ffi::c_void;
        fn objc_autoreleasePoolPop(pool: *mut core::ffi::c_void);
    }

    fn cls(name: &str) -> *mut ObjCObject {
        let c = CString::new(name).expect("类名不含 NUL");
        unsafe { objc_getClass(c.as_ptr()) }
    }

    fn sel(name: &str) -> *mut ObjCSelector {
        let c = CString::new(name).expect("SEL 名不含 NUL");
        unsafe { sel_registerName(c.as_ptr()) }
    }

    fn ns_string(s: &str) -> *mut ObjCObject {
        let c = CString::new(s).expect("字符串不含 NUL");
        unsafe {
            let f: MsgSendToObjectWithCStr = transmute(objc_msgSend as *const ());
            f(cls("NSString"), sel("stringWithUTF8String:"), c.as_ptr())
        }
    }

    fn ns_to_string(s: *mut ObjCObject) -> String {
        unsafe {
            let f: MsgSendToCStr = transmute(objc_msgSend as *const ());
            let ptr = f(s, sel("UTF8String"));
            if ptr.is_null() {
                return String::new();
            }
            CStr::from_ptr(ptr).to_string_lossy().into_owned()
        }
    }

    // 先写临时文件再原子替换，防写一半被 extension 读到半截 JSON。
    // 全程包在自建 autorelease pool 里（见上方 extern 声明处的说明）。
    unsafe {
        let pool = objc_autoreleasePoolPush();
        let result = (|| -> Result<String, String> {
            let f_default_manager: MsgSendToObject = transmute(objc_msgSend as *const ());
            let f_with_object: MsgSendToObjectWithObject = transmute(objc_msgSend as *const ());
            let manager = f_default_manager(cls("NSFileManager"), sel("defaultManager"));
            if manager.is_null() {
                return Err("NSFileManager 不可用".into());
            }
            let group = ns_string(GROUP_ID);
            let url = f_with_object(
                manager,
                sel("containerURLForSecurityApplicationGroupIdentifier:"),
                group,
            );
            if url.is_null() {
                return Err(
                    "App Group 容器不可用：签名未含 App Group capability（免费自签需侧载工具支持）"
                        .into(),
                );
            }
            let dir = ns_to_string(f_default_manager(url, sel("path")));
            if dir.is_empty() {
                return Err("App Group 容器路径为空".into());
            }
            let file_path = format!("{}/{}", dir.trim_end_matches('/'), FILE_NAME);
            let tmp_path = format!("{}.tmp", file_path);
            std::fs::write(&tmp_path, content).map_err(|e| format!("写临时文件失败：{e}"))?;
            std::fs::rename(&tmp_path, &file_path).map_err(|e| format!("原子替换失败：{e}"))?;
            Ok(file_path)
        })();
        objc_autoreleasePoolPop(pool);
        result
    }
}

#[cfg(not(target_os = "ios"))]
pub fn write_shared_snapshot(_content: &str) -> Result<String, String> {
    Err("主屏小组件仅在 iOS 上可用".into())
}

/// 共享的小组件数据通道：读/写 App Group 容器里的文件（iOS）。
/// 供 write_shared_snapshot 与 consume_widget_actions 共用的目录解析。
#[cfg(target_os = "ios")]
mod group_io {
    use std::ffi::{c_char, CStr, CString};
    use std::mem::transmute;

    pub const GROUP_ID: &str = "group.com.tt.calendar.mobile";

    #[repr(C)]
    pub struct ObjCObject {
        _private: [u8; 0],
    }

    #[repr(C)]
    pub struct ObjCSelector {
        _private: [u8; 0],
    }

    pub type MsgSendToObject = unsafe extern "C" fn(*mut ObjCObject, *mut ObjCSelector) -> *mut ObjCObject;
    pub type MsgSendToObjectWithObject =
        unsafe extern "C" fn(*mut ObjCObject, *mut ObjCSelector, *mut ObjCObject) -> *mut ObjCObject;
    pub type MsgSendToObjectWithCStr =
        unsafe extern "C" fn(*mut ObjCObject, *mut ObjCSelector, *const c_char) -> *mut ObjCObject;
    pub type MsgSendToCStr = unsafe extern "C" fn(*mut ObjCObject, *mut ObjCSelector) -> *const c_char;

    extern "C" {
        // 原始符号：可变参数，必须先声明成无签名形式再按调用点转型（见文件头说明）
        pub fn objc_msgSend();
        pub fn objc_getClass(name: *const c_char) -> *mut ObjCObject;
        pub fn sel_registerName(name: *const c_char) -> *mut ObjCSelector;
        pub fn objc_autoreleasePoolPush() -> *mut core::ffi::c_void;
        pub fn objc_autoreleasePoolPop(pool: *mut core::ffi::c_void);
    }

    pub fn cls(name: &str) -> *mut ObjCObject {
        let c = CString::new(name).expect("类名不含 NUL");
        unsafe { objc_getClass(c.as_ptr()) }
    }

    pub fn sel(name: &str) -> *mut ObjCSelector {
        let c = CString::new(name).expect("SEL 不含 NUL");
        unsafe { sel_registerName(c.as_ptr()) }
    }

    /// 解析 App Group 容器目录；失败返回 Err（签名缺 capability 等）。
    pub fn group_dir(manager: *mut ObjCObject) -> Result<String, String> {
        unsafe {
            let f_with_object: MsgSendToObjectWithObject = transmute(objc_msgSend as *const ());
            let f_to_cstr: MsgSendToCStr = transmute(objc_msgSend as *const ());
            let group = {
                let f: MsgSendToObjectWithCStr = transmute(objc_msgSend as *const ());
                f(cls("NSString"), sel("stringWithUTF8String:"), CString::new(GROUP_ID).unwrap().as_ptr())
            };
            let url = f_with_object(manager, sel("containerURLForSecurityApplicationGroupIdentifier:"), group);
            if url.is_null() {
                return Err("App Group 容器不可用：签名未含 App Group capability".into());
            }
            let ptr = f_to_cstr(url, sel("path"));
            if ptr.is_null() {
                return Err("App Group 容器路径为空".into());
            }
            Ok(CStr::from_ptr(ptr).to_string_lossy().into_owned())
        }
    }
}

/// 读取并清空小组件回传的动作队列（一键打卡：extension 写入，主 App 消费一次）。
/// 文件不存在 = 没有待消费动作，返回 "[]"。
#[cfg(target_os = "ios")]
pub fn consume_widget_actions() -> Result<String, String> {
    use group_io::*;
    use std::ffi::CStr;
    use std::mem::transmute;

    const ACTIONS_FILE: &str = "widget-actions.json";

    unsafe {
        let pool = objc_autoreleasePoolPush();
        let result = (|| -> Result<String, String> {
            let f_default_manager: MsgSendToObject = transmute(objc_msgSend as *const ());
            let manager = f_default_manager(cls("NSFileManager"), sel("defaultManager"));
            if manager.is_null() {
                return Err("NSFileManager 不可用".into());
            }
            let dir = group_dir(manager)?;
            let file_path = format!("{}/{}", dir.trim_end_matches('/'), ACTIONS_FILE);
            match std::fs::read_to_string(&file_path) {
                Ok(content) => {
                    // 读走即删：动作只消费一次
                    let _ = std::fs::remove_file(&file_path);
                    Ok(content)
                }
                Err(_) => Ok("[]".into()),
            }
        })();
        objc_autoreleasePoolPop(pool);
        result
    }
}

#[cfg(not(target_os = "ios"))]
pub fn consume_widget_actions() -> Result<String, String> {
    Ok("[]".into())
}
