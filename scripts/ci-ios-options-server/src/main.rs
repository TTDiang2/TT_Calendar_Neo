//! CI 用：冒充 tauri 的 options WebSocket 服务。
//!
//! 背景：Tauri 2 的 `tauri ios xcode-script`（由生成的 Xcode 工程
//! 「Build Rust Code」run-script phase 调用）在开头会无条件读取
//! `$TMPDIR/com.<identifier>-server-addr` 文件，并把它当成 `ws://<addr>`
//! 去建一个 WebSocket 客户端、用 JSON-RPC 调用 `options` 方法取回 `CliOptions`
//! （见 crates/tauri-cli/src/mobile/mod.rs 的 read_options）。CI 里没有真实
//! dev server，文件缺失或连不上都会 panic。
//!
//! 这里用「与 tauri-cli 同版本的 jsonrpsee」起一个最小服务，只实现 `options`
//! 方法、返回一份最小 CliOptions，让 xcode-script 跳过 dev-server 依赖、正常
//! 走完 Rust 编译（头文件/lib 输出路径都由它自己正确生成）。
//!
//! 服务绑定到 127.0.0.1:0（随机端口，和 tauri 的 write_options 一致），并把
//! `127.0.0.1:<port>` 写入 server-addr 文件（read_options 会自己拼 `ws://`）。
//!
//! API 备注（jsonrpsee 0.24）：
//!   · `register_method` 同步回调签名是 3 参数：Fn(Params, &Context, &Extensions)；
//!   · 返回值用 serde_json::json! 的 Value 即可（实现了 IntoResponse）；
//!   · 0.24 没有 `ws` feature，server feature 自带 WebSocket 服务能力。

use jsonrpsee::server::{RpcModule, ServerBuilder};
use jsonrpsee::types::Params;

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    // 绑定到随机端口（与 tauri 的 write_options 一致：127.0.0.1:0）
    let server = ServerBuilder::default().build("127.0.0.1:0").await?;
    let addr = server.local_addr()?;

    let mut module = RpcModule::new(());
    // 只实现 `options` 方法。返回的字段必须与 tauri-cli 的 CliOptions 反序列化兼容：
    //   dev: bool, features: Vec<String>, args: Vec<String>,
    //   noise_level: NoiseLevel（"Polite"|"LoudAndProud"|"FranklyQuitePedantic"）,
    //   vars: HashMap<String, OsString>, config: Vec<ConfigValue>,
    //   target_device: Option<TargetDevice>
    //
    // features 必须带 `tauri/custom-protocol`（等价于官方 `tauri ios build` 经
    // build_options() 注入的行为）：tauri 的 build.rs 以 `dev = !custom_protocol`
    // 决定运行时形态，缺了它 xcode-script 会把 lib 编成 dev 模式——运行时代理
    // 到 devUrl（http://localhost:5175），真机上白屏报 local network 错误。
    // 该 feature 经 cargo-mobile2 的 metadata.features() 变成 cargo --features。
    module.register_method("options", |_params: Params<'_>, _ctx, _ext| {
        serde_json::json!({
            "dev": false,
            "features": ["tauri/custom-protocol"],
            "args": [],
            "noise_level": "Polite",
            "vars": {},
            "config": [],
            "target_device": null
        })
    })?;

    let handle = server.start(module);

    // 把地址写入 tauri 读取的文件。read_options 会拼成 `ws://<content>`。
    let tmp = std::env::var("TMPDIR").unwrap_or_else(|_| "/tmp".to_string());
    let tmp = tmp.trim_end_matches('/');
    let file = format!("{}/com.tt.calendar.mobile-server-addr", tmp);
    std::fs::write(&file, format!("127.0.0.1:{}", addr.port()))?;
    eprintln!(
        "[ci-options-server] listening on {}; wrote addr file {}",
        addr, file
    );

    // 保持存活，直到被 CI 杀掉（trap EXIT / kill）
    tokio::signal::ctrl_c().await?;
    let _ = handle.stop();
    Ok(())
}
