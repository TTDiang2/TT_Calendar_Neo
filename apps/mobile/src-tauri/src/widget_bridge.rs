//! iOS 主屏小组件的数据桥。
//!
//! WidgetKit extension 与主 App 是两个沙盒，唯一合法的共享通道是
//! App Group 容器。WKWebView 里的 JS 摸不到原生文件系统，所以由
//! Tauri command（本模块）代写：JS 生成快照 JSON → invoke 本命令 →
//! 原子写入 group.com.tt.calendar.mobile/widget-snapshot.json →
//! extension 读同一文件。
//!
//! 实现走 ObjC runtime 直调（objc_msgSend 按 arm64 固定寄存器约定声明
//! 具体签名），零第三方依赖——不引 objc2 是为了避免与 tauri 依赖树里
//! 的 objc2 版本打架。

#[cfg(target_os = "ios")]
pub fn write_shared_snapshot(content: &str) -> Result<String, String> {
    use std::ffi::{c_char, CStr, CString};

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

    extern "C" {
        fn objc_getClass(name: *const c_char) -> *mut ObjCObject;
        fn sel_registerName(name: *const c_char) -> *mut ObjCSelector;

        // arm64 上 objc_msgSend 按固定寄存器传参（receiver=x0, SEL=x1, 参数
        // =x2..），按具体签名声明即可正确链接与调用。
        #[link_name = "objc_msgSend"]
        fn msg_send_object(receiver: *mut ObjCObject, sel: *mut ObjCSelector) -> *mut ObjCObject;
        #[link_name = "objc_msgSend"]
        fn msg_send_object_arg(
            receiver: *mut ObjCObject,
            sel: *mut ObjCSelector,
            arg: *mut ObjCObject,
        ) -> *mut ObjCObject;
        #[link_name = "objc_msgSend"]
        fn msg_send_cstr_arg(
            receiver: *mut ObjCObject,
            sel: *mut ObjCSelector,
            arg: *const c_char,
        ) -> *mut ObjCObject;
        #[link_name = "objc_msgSend"]
        fn msg_send_return_cstr(receiver: *mut ObjCObject, sel: *mut ObjCSelector) -> *const c_char;
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
        unsafe { msg_send_cstr_arg(cls("NSString"), sel("stringWithUTF8String:"), c.as_ptr()) }
    }

    fn ns_to_string(s: *mut ObjCObject) -> String {
        unsafe {
            let ptr = msg_send_return_cstr(s, sel("UTF8String"));
            if ptr.is_null() {
                return String::new();
            }
            CStr::from_ptr(ptr).to_string_lossy().into_owned()
        }
    }

    // 先写临时文件再原子替换，防写一半被 extension 读到半截 JSON。
    unsafe {
        let manager = objc_getClass(b"NSFileManager\0".as_ptr() as *const c_char);
        let manager = msg_send_object(manager, sel("defaultManager"));
        if manager.is_null() {
            return Err("NSFileManager 不可用".into());
        }
        let group = ns_string(GROUP_ID);
        let url = msg_send_object_arg(
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
        let dir_ns = msg_send_object(url, sel("path"));
        let dir = ns_to_string(dir_ns);
        if dir.is_empty() {
            return Err("App Group 容器路径为空".into());
        }
        let file_path = format!("{}/{}", dir.trim_end_matches('/'), FILE_NAME);
        let tmp_path = format!("{}.tmp", file_path);
        std::fs::write(&tmp_path, content).map_err(|e| format!("写临时文件失败：{e}"))?;
        std::fs::rename(&tmp_path, &file_path).map_err(|e| format!("原子替换失败：{e}"))?;
        Ok(file_path)
    }
}

#[cfg(not(target_os = "ios"))]
pub fn write_shared_snapshot(_content: &str) -> Result<String, String> {
    Err("主屏小组件仅在 iOS 上可用".into())
}
