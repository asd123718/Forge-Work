# Forge-Work

Windows 11–ready Forge AI IDE fork with one-click launch and model output logging.

## Quick Start (Windows 11)

1. Clone this repository.
2. Double-click **`start-forge.cmd`** or **`start-forge.exe`** in the repository root.

No separate dependency install step is required when the packaged runtime is present at:

```
.build\VSCode-win32-x64\Forge.exe
```

If that folder is missing but Forge is already installed on the machine, restore it with:

```powershell
powershell -ExecutionPolicy Bypass -File scripts\forge\restore-packaged.ps1
```

Then rebuild the app shell from source:

```powershell
powershell -ExecutionPolicy Bypass -File scripts\forge\rebuild-from-source.ps1
```

## Model Logs

Every orchestration run writes Markdown logs under **`logs/models/`**. See [logs/README.md](logs/README.md) for the format.

The launcher sets `FORGE_MODEL_LOG_DIR` automatically. Override it if you want logs elsewhere.

## What Changed vs Upstream Forge

- Windows 11 launcher wiring (`start-forge.cmd`, `start-forge.exe`, `ForgeLauncher.cs`) sets the model log directory.
- Agent-host orchestration layer writes structured Markdown logs (thinking, tool calls, output, command execution).
- **GUI, architecture, and UI event bindings are unchanged.**

## License

Same as upstream Forge / VS Code — see `LICENSE.txt` and third-party notices in the repository.
