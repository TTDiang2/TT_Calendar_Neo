// 仅桌面端启动入口：包一层 lib.run 方便日后 iOS/Android 直接复用同一份逻辑。
fn main() {
    tt_calendar_desktop_lib::run()
}
