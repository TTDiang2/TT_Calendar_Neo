# 同步配置步骤（PC ↔ 手机）

> 原理见 [SYNC_PROTOCOL.md](SYNC_PROTOCOL.md)。全程只需要一个 GitHub 账号，
> 不需要任何服务器。

## 一、准备 GitHub 数据仓

1. 登录 GitHub → 右上角 **+** → **New repository**
2. 仓库名建议 `tt-calendar-data`，**选 Private**（数据明文存放，务必私有）
3. 其他保持默认（**不要**勾选 README 初始化，空仓即可）→ Create

## 二、创建 PAT（访问令牌）

推荐 fine-grained token（权限最小化）：

1. GitHub → 头像 → **Settings** → 左下 **Developer settings**
2. **Personal access tokens → Fine-grained tokens → Generate new token**
3. Token name 随意（如 `tt-calendar`）；Expiration 建议 90 天或 1 年
4. **Repository access** → Only select repositories → 选中 `tt-calendar-data`
5. **Permissions → Repository permissions → Contents → Read and write**
   （其余保持 No access）
6. Generate → **复制 token**（只显示一次）

> classic token 也可以：勾 `repo` scope 即可，但权限更宽，不推荐。

## 三、电脑端首次上传

1. 打开网页版（或桌面版）→ **设置 → 数据同步**
2. 填写：
   - 仓库：`你的用户名/tt-calendar-data`
   - 分支：`main`
   - PAT：粘贴刚才的 token
3. **保存** → **测试连接**（应显示「连接成功：分支尚未存在（首次同步将创建）」）
4. **同步** → 显示「首次初始化完成：已上传 N 行」

到此，电脑全部数据（图层/事件/待办/倒数日/涂色/设置）已进入你的私有仓。

## 四、手机端拉取

> 手机 App 里数据存在手机本地；同步把它和电脑（以及私有仓）合并起来。

1. 手机 App → **设置 → 数据同步** → 填**同一个仓 + 同一个 PAT** → 保存 → 测试连接
2. **同步** → 提示「远端仓库已有 N 行数据，本地是首次绑定」：
   - **合并两边并上传（推荐）**：手机上已有的数据和电脑的取并集
   - **用远端覆盖本地**：手机是空库/想以电脑为准时选这个，最干净
3. 完成后回到日历，数据就在了

## 五、日常使用

| 开关 | 行为 |
|---|---|
| 启动时自动同步 | App 打开后后台静默同步一次（成功后界面自动刷新） |
| 关闭时同步 | 切后台/关闭前尽力推一次本地改动 |

随时可以在设置里手动点**同步**。冲突极少见（不同设备改同一行），
按「更新时间晚者胜」自动裁决；删除会以墓碑形式同步到所有设备。

## 六、故障排查

| 现象 | 原因与处理 |
|---|---|
| `401` | PAT 错误或过期 → 重新生成并保存 |
| `404` | 仓库名/分支写错，或 token 没有该仓库的 Contents 权限 |
| `403`（rate limit） | GitHub API 限流 → 稍后再试 |
| 「远端分支已被并发更新」 | 两台设备同时提交 → 程序会自动重拉重并，最多 3 次；手动再点一次同步即可 |
| 手机上没看到电脑数据 | 确认两端仓库/分支/PAT 完全一致；手机端是否完成了首绑决策 |
| 想重置某台设备 | 该设备设置里换一个仓，或删除本地库重装 App，再按首绑流程走 |

## 七、安全须知

- 数据**明文**存于 GitHub 私有仓 —— 仓库务必保持 Private，PAT 不要给第二个人
- PAT 只保存在本机数据库（`sync.` 私有键），不进入同步快照，永不上传
- token 泄露怎么办：GitHub → Developer settings → **立即撤销** → 换新 token
