// 仅桌面/模拟器启动入口：包一层 lib.run 方便 iOS/Android 直接复用同一份逻辑。
fn main() {
    tt_calendar_mobile_lib::run()
}
