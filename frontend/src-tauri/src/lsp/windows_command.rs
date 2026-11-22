/**
 * @description Resolves Windows command shims through cmd.exe while keeping native executables shell-free.
 * @author Albert_Luo
 * @email 480199976@qq.com
 * @date 2026-11-22 13:20
 */
use std::ffi::{OsStr, OsString};
use std::path::Path;

pub(crate) fn command_invocation(command: &Path, args: &[OsString]) -> (OsString, Vec<OsString>) {
    command_invocation_for(command, args, cfg!(windows))
}

fn command_invocation_for(
    command: &Path,
    args: &[OsString],
    windows: bool,
) -> (OsString, Vec<OsString>) {
    if !windows || !is_windows_script(command) {
        return (command.as_os_str().to_owned(), args.to_vec());
    }

    let script = command.to_string_lossy();
    let arguments = args
        .iter()
        .map(|argument| quote_cmd_argument(argument))
        .collect::<Vec<_>>()
        .join(" ");
    let invocation = if arguments.is_empty() {
        format!("call \"{script}\"")
    } else {
        format!("call \"{script}\" {arguments}")
    };
    (
        OsString::from("cmd.exe"),
        vec![
            OsString::from("/d"),
            OsString::from("/s"),
            OsString::from("/c"),
            OsString::from(invocation),
        ],
    )
}

fn is_windows_script(path: &Path) -> bool {
    path.extension()
        .and_then(OsStr::to_str)
        .is_some_and(|extension| {
            extension.eq_ignore_ascii_case("cmd") || extension.eq_ignore_ascii_case("bat")
        })
}

fn quote_cmd_argument(argument: &OsStr) -> String {
    let value = argument.to_string_lossy();
    if value
        .bytes()
        .any(|byte| byte.is_ascii_whitespace() || byte == b'"' || byte == b'&' || byte == b'|')
    {
        format!("\"{}\"", value.replace('"', "\\\""))
    } else {
        value.into_owned()
    }
}

#[cfg(test)]
mod tests {
    use std::ffi::OsString;
    use std::path::Path;

    use super::command_invocation_for;

    #[test]
    fn wraps_windows_command_shims_and_preserves_arguments() {
        let (program, args) = command_invocation_for(
            Path::new(r"C:\Program Files\nodejs\typescript-language-server.cmd"),
            &[OsString::from("--stdio")],
            true,
        );

        assert_eq!(program, "cmd.exe");
        assert_eq!(args[0], "/d");
        assert_eq!(args[1], "/s");
        assert_eq!(args[2], "/c");
        assert_eq!(
            args[3],
            r#"call "C:\Program Files\nodejs\typescript-language-server.cmd" --stdio"#
        );
    }

    #[test]
    fn leaves_native_executables_and_non_windows_commands_unchanged() {
        let command = Path::new(r"C:\tools\rust-analyzer.exe");
        let args = vec![OsString::from("--version")];

        assert_eq!(
            command_invocation_for(command, &args, true),
            (command.as_os_str().to_owned(), args.clone())
        );
        assert_eq!(
            command_invocation_for(Path::new("gopls.cmd"), &args, false),
            (OsString::from("gopls.cmd"), args)
        );
    }
}
