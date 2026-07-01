// ==UserScript==
// @name         千牛客服聊天记录导出器
// @namespace    http://tampermonkey.net/
// @version      2.1
// @description  自动导出千牛客服聊天记录为Json并打包ZIP
// @author       HHD7
// @match        *://myseller.taobao.com/*
// @match        *://qianniu.taobao.com/*
// @include      *://.taobao.com/*
// @grant        none
// @require      https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js
// ==/UserScript==


(function() {
    'use strict';

    let config = {
        maxUsers: 200,
        waitTime: 600,
        stepDelay: 200
    };

    let progress = {
        current: 0,
        total: 0,
        startTime: 0
    };

    // 拖动功能
    function makeDraggable(el) {
        const dragBar = el.querySelector('.drag-bar');
        if (!dragBar) return;

        let x1 = 0, y1 = 0, x2 = 0, y2 = 0;
        dragBar.style.cursor = 'move';

        dragBar.addEventListener('mousedown', (e) => {
            e.preventDefault();
            x2 = e.clientX;
            y2 = e.clientY;

            document.onmouseup = () => {
                document.onmousemove = null;
                document.onmouseup = null;
            };

            document.onmousemove = (e) => {
                e.preventDefault();
                x1 = x2 - e.clientX;
                y1 = y2 - e.clientY;
                x2 = e.clientX;
                y2 = e.clientY;

                el.style.top = (el.offsetTop - y1) + 'px';
                el.style.left = (el.offsetLeft - x1) + 'px';
            };
        });
    }

    // 插入按钮到 导航条
    function addButtonToPage() {
        const msgList = document.querySelector('.tbd-tabs-nav-list');
        if (!msgList) {
            setTimeout(addButtonToPage, 1500);
            console.log('error no nav-list')
            return;
        }

        const btn = document.createElement('button');
        btn.innerText = '导出聊天记录';
        btn.style.cssText = `
            padding: 6px 14px;
            background: #00b42a;
            color: #fff;
            border: none;
            border-radius: 6px;
            cursor: pointer;
            font-size: 13px;
            margin-bottom: 8px;
        `;
        btn.onclick = showSettingModal;

        if (msgList.parentNode) {
            msgList.parentNode.insertBefore(btn, msgList);
        }
    }

    // 弹窗设置
    function showSettingModal() {
        const modal = document.createElement('div');
        modal.style.cssText = `
            position: fixed;
            width: 300px;
            background: #fff;
            border-radius: 10px;
            box-shadow: 0 4px 20px rgba(0,0,0,0.2);
            padding: 15px;
            z-index: 999999;
            left: calc(50% - 150px);
            top: calc(50% - 160px);
            user-select: none;
        `;
        modal.innerHTML = `
            <div class="drag-bar" style="padding:8px; text-align:center; font-weight:bold; border-bottom:1px solid #eee; margin-bottom:10px;">
                导出设置
            </div>
            <div style="font-size:13px; margin:10px 0; display:flex; justify-content:space-between; align-items:center;">
                最多导出客户数
                <input type="number" id="maxUsers" value="${config.maxUsers}" style="width:70px; padding:4px;">
            </div>
            <div style="font-size:13px; margin:10px 0; display:flex; justify-content:space-between; align-items:center;">
                切换等待时间(ms)
                <input type="number" id="waitTime" value="${config.waitTime}" style="width:70px; padding:4px;">
            </div>
            <div style="display:flex; gap:10px; margin-top:15px;">
                <button id="startExport" style="flex:1; padding:8px; background:#00b42a; color:#fff; border:none; border-radius:6px; cursor:pointer;">
                    开始导出
                </button>
                <button id="closeModal" style="flex:1; padding:8px; background:#eee; border:none; border-radius:6px; cursor:pointer;">
                    取消
                </button>
            </div>
            <div style="margin-top:12px; display:none;" id="progressBox">
                <div style="width:100%; height:10px; background:#eee; border-radius:5px; overflow:hidden;">
                    <div id="progressFill" style="width:0%; height:100%; background:#00b42a; transition: width 0.3s;"></div>
                </div>
                <div id="progressText" style="font-size:12px; margin-top:6px; text-align:center;"></div>
            </div>
        `;
        document.body.appendChild(modal);
        makeDraggable(modal);

        modal.querySelector('#closeModal').onclick = () => {
            modal.remove();
        };

        modal.querySelector('#startExport').onclick = () => {
            config.maxUsers = parseInt(document.getElementById('maxUsers').value) || 200;
            config.waitTime = parseInt(document.getElementById('waitTime').value) || 600;
            startExport(modal);
        };
    }

    // 更新进度条
    function updateProgress(current, total, modal) {
        progress.current = current;
        progress.total = total;
        const pct = (current / total * 100).toFixed(1);
        modal.querySelector('#progressFill').style.width = pct + '%';

        const elapsed = Date.now() - progress.startTime;
        const avg = current > 0 ? elapsed / current : 0;
        const remain = (total - current) * (config.waitTime + config.stepDelay + avg / 2);
        const remainSec = Math.round(remain / 1000);

        modal.querySelector('#progressText').innerText =
            `进度：${current}/${total} (${pct}%) · 预计剩余 ${remainSec} 秒`;
    }

    // 提取聊天记录
    function extractCurrentChat() {
        const records = [];
        const container = document.querySelector('.message-container');
        const right = container?.querySelector('.message-list-right');
        if (!right) return records;

        const groups = right.querySelectorAll(':scope > div');
        groups.forEach(g => {
            const date = g.querySelector('div:first-child')?.textContent.trim() || '';
            const items = g.querySelectorAll('div > div:has(span)');

            items.forEach(item => {
                const time = item.querySelector('div:first-child')?.textContent.trim() || '';
                const wrap = item.querySelector('div:nth-child(2)');
                if (!wrap) return;

                const spans = wrap.querySelectorAll('span');
                const text = spans[0]?.getAttribute('title') || spans[0]?.textContent.trim() || '';
                const sender = spans[1]?.textContent.trim() || '';
                const img = wrap.querySelector('img')?.src || '';

                if ((text && text.trim()) || img) {
                    records.push({ date, time, sender, text, imgUrl: img });
                }
            });
        });
        return records;
    }

    // 导出主逻辑
    async function startExport(modal) {
        const btn = modal.querySelector('#startExport');
        const progressBox = modal.querySelector('#progressBox');
        const closeBtn = modal.querySelector('#closeModal');

        btn.innerText = '导出中...';
        btn.disabled = true;
        btn.style.background = '#666';
        closeBtn.disabled = true;
        progressBox.style.display = 'block';

        try {
            const leftPanel = document.querySelector('.message-container .message-list-left');
            if (!leftPanel) throw new Error('未找到聊天列表');

            const userList = Array.from(leftPanel.querySelectorAll('.results-list')).slice(0, config.maxUsers);
            if (!userList.length) throw new Error('未找到任何聊天对象');

            progress.startTime = Date.now();
            updateProgress(0, userList.length, modal);
            const zip = new JSZip();

            for (let i = 0; i < userList.length; i++) {
                const el = userList[i];
                const userName = el.getAttribute('title')?.trim();
                if (!userName) continue;

                el.click();
                await new Promise(r => setTimeout(r, config.waitTime));

                const chats = extractCurrentChat();
                const safeName = userName.replace(/[\\/:*?"<>|]/g, '_');
                zip.file(`${safeName}.json`, JSON.stringify({
                    user: userName,
                    exportTime: new Date().toLocaleString(),
                    count: chats.length,
                    chats: chats
                }, null, 2));

                updateProgress(i + 1, userList.length, modal);
                await new Promise(r => setTimeout(r, config.stepDelay));
            }

            // 生成并下载ZIP
            const blob = await zip.generateAsync({ type: 'blob' });
            const link = document.createElement('a');
            link.href = URL.createObjectURL(blob);
            link.download = `千牛聊天记录_${new Date().toLocaleDateString().replace(/\//g, '-')}.zip`;
            link.click();
            URL.revokeObjectURL(link.href);

            modal.querySelector('#progressText').innerText = '✅ 导出完成！文件已下载';
            btn.innerText = '导出完成';

            setTimeout(() => {
                modal.remove();
            }, 1500);

        } catch (err) {
            alert('导出失败：' + err.message);
            console.error('导出错误：', err);
            btn.innerText = '开始导出';
            btn.disabled = false;
            btn.style.background = '#00b42a';
            closeBtn.disabled = false;
        }
    }

    // 启动
    window.addEventListener('load', () => {
        setTimeout(addButtonToPage, 1500);
    });
})();
