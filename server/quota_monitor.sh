#!/bin/bash
# 流量監控腳本 (Quota Monitor)
# 用於檢查 VPS 流量是否接近配額 (2TB)，若超過 95% 則自動停止服務以防超支
# 建議設定 crontab 每小時執行一次: 0 * * * * /opt/game-websocket/quota_monitor.sh

QUOTA_LIMIT_GB=2000 # Vultr $5 Plan: 2000GB (2TB)
THRESHOLD_PERCENT=95
INTERFACE="eth0" # 根據實際網卡修改，通常是 eth0 或 enp1s0

# 獲取當前月流量 (使用 vnstat)
if ! command -v vnstat &> /dev/null; then
    echo "錯誤: 未安裝 vnstat。請執行 apt install vnstat"
    exit 1
fi

# 獲取當月 RX+TX 總量 (GB)
USED_GB=$(vnstat --oneline | awk -F';' '{print $11}' | sed 's/ GiB//')

# 如果 vnstat 輸出單位不是 GiB (例如 MiB)，做簡單轉換 (這裡簡化處理，假設流量較大時都是 GiB)
# 實際生產環境建議用更嚴謹的解析
UNIT=$(vnstat --oneline | awk -F';' '{print $11}' | awk '{print $2}')
if [ "$UNIT" == "MiB" ]; then
    USED_GB=$(echo "$USED_GB / 1024" | bc -l)
fi

# 計算百分比
PERCENT=$(echo "$USED_GB / $QUOTA_LIMIT_GB * 100" | bc -l)
PERCENT_INT=${PERCENT%.*}

echo "當前流量使用: $USED_GB GiB / $QUOTA_LIMIT_GB GiB ($PERCENT_INT%)"

if [ "$PERCENT_INT" -ge "$THRESHOLD_PERCENT" ]; then
    echo "⚠️ 警告: 流量已超過安全閾值 ($THRESHOLD_PERCENT%)！正在停止遊戲服務..."
    systemctl stop game-websocket
    echo "服務已停止。"
else
    echo "✅ 流量正常。"
fi
