// 移动端主逻辑入口。
// 第一版只做最薄壳：启动默认窗口，UI 来自 packages/ui（已由 vite 构建）。
// 数据在开发期由 Node sidecar 提供（端口 8769）；真机应改用原生 SQLite 桥。

mod widget_bridge;

/// 主屏小组件数据桥：前端把当日概览 JSON 传进来，写入 App Group 容器
/// 供 WidgetKit extension 读取（见 widget_bridge.rs 与 apps/mobile/widget/）。
#[tauri::command]
fn export_widget_snapshot(payload: String) -> Result<String, String> {
    widget_bridge::write_shared_snapshot(&payload)
}

/// 消费小组件回传的动作队列（一键打卡：extension 写入 → 主 App 启动/刷新时落到真库）
#[tauri::command]
fn consume_widget_actions() -> Result<String, String> {
    widget_bridge::consume_widget_actions()
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        // 本地通知插件（20260917 任务书 1.2-6：待办到期/重要日期的系统提醒）
        .plugin(tauri_plugin_notification::init())
        .invoke_handler(tauri::generate_handler![export_widget_snapshot, consume_widget_actions])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
