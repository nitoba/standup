# Comando universal
if [ "$(uname -s 2>/dev/null)" ]; then
  # Linux / macOS
  curl -fsSL https://raw.githubusercontent.com/nitoba/standup/main/scripts/install-standup.sh | bash
elif powershell -Command "exit 0" 2>/dev/null; then
  # Windows PowerShell
  powershell -NoProfile -ExecutionPolicy Bypass -Command "irm https://raw.githubusercontent.com/nitoba/standup/main/scripts/install-standup.ps1 | iex"
else
  echo "❌ Sistema operacional não suportado."
fi
