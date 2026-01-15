#!/bin/bash
# WebSocket 服务器诊断脚本

echo "=== WebSocket 服务器诊断 ==="
echo ""

echo "1. 检查服务状态："
sudo systemctl status game-websocket --no-pager -l | head -20
echo ""

echo "2. 检查端口监听："
sudo ss -tuln | grep 8080
echo ""

echo "3. 检查证书文件："
if [ -f /opt/game-websocket/cert.pem ]; then
    echo "✅ cert.pem 存在"
    ls -l /opt/game-websocket/cert.pem
else
    echo "❌ cert.pem 不存在"
fi

if [ -f /opt/game-websocket/key.pem ]; then
    echo "✅ key.pem 存在"
    ls -l /opt/game-websocket/key.pem
else
    echo "❌ key.pem 不存在"
fi
echo ""

echo "4. 检查防火墙："
sudo ufw status | grep 8080
echo ""

echo "5. 查看最近日志："
sudo journalctl -u game-websocket -n 20 --no-pager
echo ""

echo "6. 测试本地连接："
curl -k https://localhost:8080 2>&1 | head -5
echo ""

echo "=== 诊断完成 ==="

