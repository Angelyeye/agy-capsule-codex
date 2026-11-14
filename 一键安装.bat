@echo off
chcp 65001 >nul
echo ====================================================
echo   agy-capsule 一键安装脚本
echo ====================================================
echo.

set "SRC_DIR=%~dp0agy-capsule"
set "DST_DIR=%USERPROFILE%\.gemini\config\plugins\agy-capsule"

if not exist "%SRC_DIR%\plugin.json" (
    echo [错误] 未找到 "%SRC_DIR%\plugin.json"，请确认在仓库完整目录中运行本脚本！
    pause
    exit /b 1
)

echo 正在安装到: "%DST_DIR%" ...
if not exist "%USERPROFILE%\.gemini\config\plugins" (
    mkdir "%USERPROFILE%\.gemini\config\plugins"
)

xcopy "%SRC_DIR%" "%DST_DIR%\" /E /I /Y /Q >nul
if %ERRORLEVEL% NEQ 0 (
    echo [错误] 复制文件失败，请检查权限。
    pause
    exit /b 1
)

echo.
echo [成功] agy-capsule 插件已安装到:
echo        %DST_DIR%
echo.
echo 下一步:
echo   1. 请完全退出并重启 Antigravity 客户端（拉起后台 Sidecar 守护进程）
echo   2. 重启后打开任意对话，输入框左下角即可看到上下文与额度胶囊！
echo.
pause
