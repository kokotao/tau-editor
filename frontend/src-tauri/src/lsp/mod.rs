/**
 * @description LSP Supervisor 模块：管理语言服务器会话和 JSON-RPC stdio 通道
 * @author Albert_Luo
 * @email 480199976@qq.com
 * @date 2026-10-03 10:10
 */
mod manager;
mod process;
mod protocol;
mod windows_command;
pub mod provisioner;

pub use manager::LspSupervisor;
pub use process::LspSession;
pub use protocol::{encode_message, read_message};
pub(crate) use windows_command::command_invocation;
pub use provisioner::LspProvisioner;
