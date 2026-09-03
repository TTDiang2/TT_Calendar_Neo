// 桌面端主逻辑入口。
// 第一版只做最薄壳：启动默认窗口，UI 来自 packages/ui（已由 vite 构建）。
// 数据由 Node sidecar 提供（端口 8767）；sidecar 接入留待下一步。
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
