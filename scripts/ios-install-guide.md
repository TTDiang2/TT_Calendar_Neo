# iOS 真机安装说明（免费 · Sideloadly）

本工程 CI 产出一个**未签名**的真机 .ipa（`tt-calendar-ios-unsigned.ipa`），
你用免费 Apple ID 在 Windows 上签名后即可装到自己的 iPhone。无需 $99 开发者账号。

## 你需要
- 一台 Windows 电脑
- 一根数据线（接 iPhone）
- iPhone（iOS 14+）
- Apple ID（免费即可，用邮箱注册的）

## 步骤

### 1. 下载 .ipa
在 GitHub 仓库的 **Actions → iOS build → 最新一次运行** 页面底部 Artifacts 里，
下载 `tt-calendar-ios-unsigned-ipa`，解压得到 `tt-calendar-ios-unsigned.ipa`。

### 2. 下载 Sideloadly
到 https://sideloadly.io 下载并安装 Windows 版。它免费，用 Apple ID 登录即可（不会自动续费）。

### 3. 签名并安装
1. iPhone 用数据线连电脑，首次信任这台电脑；
2. 打开 Sideloadly，确认顶部识别到你的 iPhone；
3. **Apple ID** 一栏填你的免费 Apple ID，勾选「使用 Apple ID 登录」；
4. 把下载的 `.ipa` **拖进** Sideloadly 窗口（或点中间选择文件）；
5. 点 **Start**，按提示输入 Apple ID 密码（仅用于签名，若开了双重认证再填一次验证码）；
6. 等待进度条走完，iPhone 上出现 App 图标。

### 4. 信任开发者（第一次打开必做）
iPhone 上：**设置 → 通用 → VPN 与设备管理** → 找到你的 Apple ID 那一项 → 点「信任」。
回到主屏就能打开 App 了。

## 注意
- **7 天有效期**：免费签名 7 天后 App 会打不开。重开电脑 + 手机，用 Sideloadly 重新 Start 一次即可续上（数据在手机里，不会丢）。
- **数据地址**：本版 App 内数据仍指向你的 PC 上的数据服务（穿透域名）。跑 App 时电脑要开着数据服务与穿透客户端。等「数据本地化」完成后再更新，即可完全脱离电脑。
- 装不了 / 报错：看 Sideloadly 下方日志，常见是 Apple ID 密码/双重认证、或未信任电脑。仍不行把日志发我。
