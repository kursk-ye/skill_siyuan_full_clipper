const fs = require('fs');
const path = require('path');

// 向上级寻找配置，适配不同的智能体系统结构
function findConfig() {
    let currentDir = process.cwd();
    while (currentDir !== path.parse(currentDir).root) {
        const configJson = path.join(currentDir, 'config.json');
        const openclawJson = path.join(currentDir, 'openclaw.json');
        
        if (fs.existsSync(configJson)) {
            return JSON.parse(fs.readFileSync(configJson, 'utf8'));
        }
        if (fs.existsSync(openclawJson)) {
            return JSON.parse(fs.readFileSync(openclawJson, 'utf8'));
        }
        
        currentDir = path.dirname(currentDir);
    }
    return {};
}

async function main() {
    console.log("🚀 开始周期性工作: 抽取全量思源目录树 (Siyuan expert) ...");

    // 获取配置
    const config = findConfig();

    // 环境变量覆盖
    if (process.env.SIYUAN_API) {
        config.siyuan = config.siyuan || {};
        config.siyuan.api = process.env.SIYUAN_API;
    }
    if (process.env.SIYUAN_TOKEN) {
        config.siyuan = config.siyuan || {};
        config.siyuan.token = process.env.SIYUAN_TOKEN;
    }

    // 验证思源配置
    if (!config.siyuan?.api || !config.siyuan?.token) {
        console.error('❌ 思源配置缺失：需要在 config.json 中设置 siyuan.api 和 siyuan.token');
        console.error('   或使用环境变量：SIYUAN_API 和 SIYUAN_TOKEN');
        process.exit(1);
    }

    const siyuanApi = config.siyuan.api;
    const siyuanToken = config.siyuan.token;

    try {
        console.log(`📡 正在连接本地思源笔记: ${siyuanApi}`);
        const headers = { 'Content-Type': 'application/json' };
        if (siyuanToken) {
            headers['Authorization'] = `Token ${siyuanToken}`;
        }
        
        // 1. 获取所有笔记本
        const nbRes = await fetch(`${siyuanApi}/api/notebook/lsNotebooks`, {
            method: 'POST', 
            headers: headers, 
            body: JSON.stringify({})
        });
        
        if (!nbRes.ok) {
           throw new Error(`连接失败! HTTP Status: ${nbRes.status}. 确保思源笔记内核已运行!`);
        }
        
        const nbData = await nbRes.json();
        if (nbData.code !== 0) {
            throw new Error(`思源API返回错误: ${nbData.msg}`);
        }
        
        const notebooks = nbData.data?.notebooks || [];
        const nbMap = {};
        // 剔除已关闭（断开）的笔记本
        notebooks.filter(nb => !nb.closed).forEach(nb => nbMap[nb.id] = nb.name);
        console.log(`📚 命中有效笔记本数量: ${Object.keys(nbMap).length}`);

        // 2. 利用 SQL 抓取文档树块 (提取所有 block type='d' 的完整路径 hpath)
        const sqlRes = await fetch(`${siyuanApi}/api/query/sql`, {
            method: 'POST', 
            headers: headers,
            body: JSON.stringify({ stmt: "SELECT box, hpath FROM blocks WHERE type='d' LIMIT 999999" })
        });
        const sqlData = await sqlRes.json();

        // 3. 构建临时数据树
        const treesMap = {};
        for (const nbName of Object.values(nbMap)) {
            treesMap[nbName] = {};
        }

        if (sqlData.data) {
            sqlData.data.forEach(row => {
                const nbName = nbMap[row.box];
                if (!nbName || !row.hpath) return;

                // 思源笔记的路径含有 '/', 我们在此将扁平字段还原成 json 深层嵌套形式 
                const parts = row.hpath.split('/').filter(p => p);
                if (parts.length === 0) return;

                let currentMap = treesMap[nbName];
                for (let i = 0; i < parts.length; i++) {
                    const part = parts[i];
                    if (!currentMap[part]) {
                        currentMap[part] = {};
                    }
                    currentMap = currentMap[part];
                }
            });
        }

        // ====== 核心剪枝策略机制 ======
        function convertMapToArray(mapObj) {
            const keys = Object.keys(mapObj);
            if (keys.length === 0) return [];

            const leafKeys   = keys.filter(k => Object.keys(mapObj[k]).length === 0);
            const branchKeys = keys.filter(k => Object.keys(mapObj[k]).length > 0);

            const arr = [];
            // 叶子节点 (底层的纯文章) 我们只抽取前面 3 个来作为喂给大模型的判断样例依据! 其它丢弃。
            for (const k of leafKeys.slice(0, 3)) {
                arr.push(k);
            }
            // 实体目录（继续承载有下一级的对象），则进行递归，保留骨架不改变。
            for (const k of branchKeys) {
                const childObj = {};
                childObj[k] = convertMapToArray(mapObj[k]);
                arr.push(childObj);
            }
            return arr;
        }

        // 开始最终组装 JSON
        const finalTree = {};
        for (const [nbName, nbMapObj] of Object.entries(treesMap)) {
            finalTree[nbName] = convertMapToArray(nbMapObj);
        }

        // 4. 定向持久化磁盘存储（项目根目录）
        const outPath = path.join(__dirname, '..', '..', 'categories.json');
        fs.writeFileSync(outPath, JSON.stringify(finalTree, null, 2), 'utf8');
        
        console.log(`✅ 成功萃取! 包含裁剪样本结构的思源知识库树体系已存储至: ${outPath}`);

    } catch (err) {
        console.error("❌ 抓取失败:", err.message);
        process.exit(1);
    }
}

main();
