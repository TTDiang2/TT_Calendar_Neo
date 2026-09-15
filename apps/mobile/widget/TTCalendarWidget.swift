// TT 日历 · 主屏小组件（WidgetKit extension）。
// 数据来源：主 App 通过 Tauri command 把当日概览 JSON 写进 App Group 容器
// （group.com.tt.calendar.mobile/widget-snapshot.json），本进程只读该文件，
// 不访问网络、不访问主 App 沙盒。时间线 30 分钟兜底刷新；App 前台数据变化时
// 会在写文件后由系统尽快重载更及时的版本。

import WidgetKit
import SwiftUI

private let appGroupID = "group.com.tt.calendar.mobile"
private let snapshotFileName = "widget-snapshot.json"

struct WSnapshot: Decodable {
    var generatedAt: String?
    var today: String?
    var todos: [WTodo]?
    var events: [WEvent]?
}

struct WTodo: Decodable {
    var title: String
    var overdue: Bool?
}

struct WEvent: Decodable {
    var title: String
    var time: String?
}

func loadSnapshot() -> WSnapshot? {
    guard let dir = FileManager.default.containerURL(
        forSecurityApplicationGroupIdentifier: appGroupID
    ) else { return nil }
    let fileURL = dir.appendingPathComponent(snapshotFileName)
    guard let data = try? Data(contentsOf: fileURL) else { return nil }
    return try? JSONDecoder().decode(WSnapshot.self, from: data)
}

struct TodayEntry: TimelineEntry {
    let date: Date
    let snap: WSnapshot?
}

struct Provider: TimelineProvider {
    // 显式绑定关联类型：只用 placeholder 的返回类型不足以让编译器把 Entry
    // 解析出来（CI 实测报 "reference to invalid associated type 'Entry'"），
    // 且下面三个方法一律用具体类型 TodayEntry，不写裸 Entry。
    typealias Entry = TodayEntry

    func placeholder(in context: Context) -> TodayEntry {
        TodayEntry(date: Date(), snap: nil)
    }

    func getSnapshot(in context: Context, completion: @escaping (TodayEntry) -> Void) {
        completion(TodayEntry(date: Date(), snap: loadSnapshot()))
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<TodayEntry>) -> Void) {
        let entry = TodayEntry(date: Date(), snap: loadSnapshot())
        // 兜底刷新：30 分钟后（主 App 每次写数据时会请求更即时的重载）
        let next = Calendar.current.date(byAdding: .minute, value: 30, to: Date())
            ?? Date().addingTimeInterval(1800)
        completion(Timeline(entries: [entry], policy: .after(next)))
    }
}

private func shortDate(_ d: Date) -> String {
    let f = DateFormatter()
    f.locale = Locale(identifier: "zh_CN")
    f.dateFormat = "M月d日 EEEE"
    return f.string(from: d)
}

struct TodayWidgetView: View {
    var entry: TodayEntry

    var body: some View {
        let snap = entry.snap
        let todos = snap?.todos ?? []
        let events = snap?.events ?? []
        VStack(alignment: .leading, spacing: 5) {
            HStack(spacing: 4) {
                Image(systemName: "calendar")
                    .font(.system(size: 10, weight: .semibold))
                    .foregroundColor(.pink)
                Text(shortDate(entry.date))
                    .font(.system(size: 11, weight: .medium))
                    .foregroundColor(.secondary)
                    .lineLimit(1)
                Spacer(minLength: 0)
            }
            if !events.isEmpty {
                ForEach(events.prefix(3).indices, id: \.self) { i in
                    HStack(spacing: 4) {
                        Circle().fill(Color.pink).frame(width: 5, height: 5)
                        Text(events[i].title)
                            .font(.system(size: 12))
                            .lineLimit(1)
                        Spacer(minLength: 0)
                        if let t = events[i].time, !t.isEmpty {
                            Text(t).font(.system(size: 10)).foregroundColor(.secondary)
                        }
                    }
                }
            }
            if !todos.isEmpty {
                ForEach(todos.prefix(events.isEmpty ? 4 : 2).indices, id: \.self) { i in
                    HStack(spacing: 4) {
                        Circle().stroke(Color.gray.opacity(0.6), lineWidth: 1.2)
                            .frame(width: 8, height: 8)
                        Text(todos[i].title)
                            .font(.system(size: 12))
                            .strikethrough(todos[i].overdue == true)
                            .lineLimit(1)
                        if todos[i].overdue == true {
                            Text("逾期").font(.system(size: 9)).foregroundColor(.red)
                        }
                        Spacer(minLength: 0)
                    }
                }
            }
            if events.isEmpty && todos.isEmpty {
                Text(snap == nil ? "打开 App 同步数据" : "今天没有安排 🎉")
                    .font(.system(size: 12))
                    .foregroundColor(.secondary)
            }
            Spacer(minLength: 0)
        }
        .padding(6)
    }
}

struct TodayWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: "TTTodayWidget", provider: Provider()) { entry in
            // iOS 17+ 要求 widget 用 containerBackground 声明背景，否则系统会
            // 警告并在部分场景下背景显示异常；旧的 .systemSmall/Medium 布局不变。
            if #available(iOS 17.0, *) {
                TodayWidgetView(entry: entry)
                    .containerBackground(.fill.tertiary, for: .widget)
            } else {
                TodayWidgetView(entry: entry)
            }
        }
        .configurationDisplayName("今日概览")
        .description("今天的日程与待办一览")
        .supportedFamilies([.systemSmall, .systemMedium])
    }
}

@main
struct TTCalendarWidgets: WidgetBundle {
    var body: some Widget {
        TodayWidget()
    }
}
