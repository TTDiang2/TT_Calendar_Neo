// TT 日历 · 主屏小组件（WidgetKit extension）。
//
// 数据来源：主 App 通过 Tauri command 把当日概览 JSON 写进 App Group 容器
// （group.com.tt.calendar.mobile/widget-snapshot.json），本进程只读该文件，
// 不访问网络、不访问主 App 沙盒。
//
// 刷新时序（如实说明，别把注释写成承诺）：
//   · 文件侧：App 在前台时每 15 分钟、以及回前台/同步完成时重写快照；
//   · 界面侧：本时间线请求 15 分钟后重载，但**最终由 iOS 调度**（可延后），
//     且当前没有调用 WidgetCenter.reloadAllTimelines()——App 写完文件不会
//     立刻触发重载，最坏情况要等到下次时间线刷新才显示新数据。
//     （补 reload 需要在主 App target 链接 WidgetKit 再从 Rust 调 ObjC，
//      属后续增强；这里先保证说法与实现一致。）

import WidgetKit
import SwiftUI

private let appGroupID = "group.com.tt.calendar.mobile"
private let snapshotFileName = "widget-snapshot.json"

struct WSnapshot: Decodable {
    var generatedAt: String?
    var today: String?
    var todos: [WTodo]?
    var events: [WEvent]?
    var countdowns: [WCountdown]?
    var coloring: [WColoring]?
    var stats: WStats?
}

struct WTodo: Decodable {
    var title: String
    var overdue: Bool?
}

struct WEvent: Decodable {
    var title: String
    var time: String?
}

struct WCountdown: Decodable {
    var name: String
    var daysLeft: Int?
    var date: String?
}

struct WColoring: Decodable {
    var date: String
    var level: Int?
}

struct WStats: Decodable {
    var total: Int?
    var completed: Int?
    var incomplete: Int?
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
        // 与文件侧刷新节奏对齐：请求 15 分钟后重载（实际由 iOS 调度，可延后）
        let next = Calendar.current.date(byAdding: .minute, value: 15, to: Date())
            ?? Date().addingTimeInterval(900)
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

// ── 倒数日小组件 ──────────────────────────────────────────────────────

struct CountdownWidgetView: View {
    var entry: TodayEntry

    var body: some View {
        let items = entry.snap?.countdowns ?? []
        VStack(alignment: .leading, spacing: 5) {
            HStack(spacing: 4) {
                Image(systemName: "hourglass")
                    .font(.system(size: 10, weight: .semibold))
                    .foregroundColor(.pink)
                Text("倒数日")
                    .font(.system(size: 11, weight: .medium))
                    .foregroundColor(.secondary)
                Spacer(minLength: 0)
            }
            if items.isEmpty {
                Text(snapEmptyText(entry.snap))
                    .font(.system(size: 12))
                    .foregroundColor(.secondary)
            } else {
                ForEach(items.prefix(3).indices, id: \.self) { i in
                    HStack(spacing: 4) {
                        Text(items[i].name)
                            .font(.system(size: 12))
                            .lineLimit(1)
                        Spacer(minLength: 0)
                        if let left = items[i].daysLeft {
                            Text(left == 0 ? "今天" : "\(left)天")
                                .font(.system(size: 11, weight: .semibold))
                                .foregroundColor(left <= 7 ? .pink : .secondary)
                        }
                    }
                }
            }
            Spacer(minLength: 0)
        }
        .padding(6)
    }
}

private func snapEmptyText(_ snap: WSnapshot?) -> String {
    snap == nil ? "打开 App 同步数据" : "暂无倒数日"
}

struct TTCCountdownWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: "TTCountdownWidget", provider: Provider()) { entry in
            if #available(iOS 17.0, *) {
                CountdownWidgetView(entry: entry)
                    .containerBackground(.fill.tertiary, for: .widget)
            } else {
                CountdownWidgetView(entry: entry)
            }
        }
        .configurationDisplayName("倒数日")
        .description("最近的三个倒数日")
        .supportedFamilies([.systemSmall])
    }
}

// ── 本月完成小组件（当月待办完成热力网格） ────────────────────────────

/// 与前端 TODO_BUSY_DONE_COLORS 一致的 5 档 GitHub 绿（20260917 任务书 1.2-5：
/// 已完成色阶统一为贡献图绿；充实度退出默认后热力口径切换为待办完成）
private let coloringPalette = [
    Color(red: 0.922, green: 0.929, blue: 0.941),
    Color(red: 0.608, green: 0.914, blue: 0.659),
    Color(red: 0.251, green: 0.769, blue: 0.388),
    Color(red: 0.188, green: 0.631, blue: 0.306),
    Color(red: 0.129, green: 0.431, blue: 0.224),
]

struct ColoringWidgetView: View {
    var entry: TodayEntry

    /// 当月日期 → (日号, 档位)；没有涂色记录的日子不画点
    private func monthCells(_ snap: WSnapshot?) -> [(day: Int, level: Int)] {
        let list = snap?.coloring ?? []
        guard !list.isEmpty else { return [] }
        let dayPrefix = String((snap?.today ?? "").prefix(8)) // YYYY-MM-
        return list.compactMap { c in
            guard c.date.hasPrefix(dayPrefix), let level = c.level else { return nil }
            let dayNum = Int(c.date.suffix(2)) ?? Int(c.date.suffix(1)) ?? 0
            return dayNum > 0 ? (dayNum, max(0, min(4, level))) : nil
        }.sorted { $0.day < $1.day }
    }

    var body: some View {
        let cells = monthCells(entry.snap)
        VStack(alignment: .leading, spacing: 5) {
            HStack(spacing: 4) {
                Image(systemName: "paintpalette")
                    .font(.system(size: 10, weight: .semibold))
                    .foregroundColor(.green)
                Text("本月完成")
                    .font(.system(size: 11, weight: .medium))
                    .foregroundColor(.secondary)
                Spacer(minLength: 0)
            }
            if cells.isEmpty {
                Text(snapEmptyText(entry.snap))
                    .font(.system(size: 12))
                    .foregroundColor(.secondary)
            } else {
                let cols = [GridItem(.adaptive(minimum: 14), spacing: 3)]
                LazyVGrid(columns: cols, alignment: .leading, spacing: 3) {
                    ForEach(cells, id: \.day) { cell in
                        RoundedRectangle(cornerRadius: 3)
                            .fill(coloringPalette[min(4, max(0, cell.level))])
                            .aspectRatio(1, contentMode: .fit)
                            .overlay(
                                Text("\(cell.day)")
                                    .font(.system(size: 8))
                                    .foregroundColor(cell.level >= 3 ? .white : .secondary)
                            )
                    }
                }
            }
            Spacer(minLength: 0)
        }
        .padding(6)
    }
}

struct TTCColoringWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: "TTColoringWidget", provider: Provider()) { entry in
            if #available(iOS 17.0, *) {
                ColoringWidgetView(entry: entry)
                    .containerBackground(.fill.tertiary, for: .widget)
            } else {
                ColoringWidgetView(entry: entry)
            }
        }
        .configurationDisplayName("本月完成")
        .description("当月待办完成热力图")
        .supportedFamilies([.systemMedium])
    }
}

// ── 完成概览小组件 ────────────────────────────────────────────────────

struct StatsWidgetView: View {
    var entry: TodayEntry

    var body: some View {
        let stats = entry.snap?.stats
        let done = stats?.completed ?? 0
        let total = max(stats?.total ?? 0, 1)
        let rate = stats?.total == nil || stats?.total == 0 ? 0.0 : Double(done) / Double(total)
        VStack(alignment: .leading, spacing: 5) {
            HStack(spacing: 4) {
                Image(systemName: "chart.pie.fill")
                    .font(.system(size: 10, weight: .semibold))
                    .foregroundColor(.pink)
                Text("完成概览")
                    .font(.system(size: 11, weight: .medium))
                    .foregroundColor(.secondary)
                Spacer(minLength: 0)
            }
            Spacer(minLength: 0)
            Text("\(Int((rate * 100).rounded()))%")
                .font(.system(size: 26, weight: .bold))
                .foregroundColor(.pink)
            Text("已完成 \(done) / 共 \(stats?.total ?? 0) 项")
                .font(.system(size: 11))
                .foregroundColor(.secondary)
            Spacer(minLength: 0)
        }
        .padding(6)
    }
}

struct TTCStatsWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: "TTStatsWidget", provider: Provider()) { entry in
            if #available(iOS 17.0, *) {
                StatsWidgetView(entry: entry)
                    .containerBackground(.fill.tertiary, for: .widget)
            } else {
                StatsWidgetView(entry: entry)
            }
        }
        .configurationDisplayName("完成概览")
        .description("待办完成率一览")
        .supportedFamilies([.systemSmall])
    }
}

@main
struct TTCalendarWidgets: WidgetBundle {
    var body: some Widget {
        TodayWidget()
        TTCCountdownWidget()
        TTCColoringWidget()
        TTCStatsWidget()
    }
}
