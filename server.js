const express = require('express');
const open = require('open');
const path = require('path');
const axios = require('axios');
const fs = require('fs');
const { exec } = require('child_process');

process.on('uncaughtException', (err) => {
    console.error('Uncaught Exception:', err);
});
process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

const app = express();
const PORT = 3000;

// Parse command line arguments for files
const initialFiles = process.argv.slice(2).filter(arg => {
    try {
        // Remove quotes if present
        const cleanPath = arg.replace(/^"|"$/g, '');
        return fs.existsSync(cleanPath) && fs.lstatSync(cleanPath).isFile();
    } catch (e) {
        return false;
    }
}).map(arg => arg.replace(/^"|"$/g, ''));

app.use(express.static(path.join(__dirname, 'public')));

app.get('/api/initial-files', (req, res) => {
    res.json(initialFiles);
});

app.get('/fetch', async (req, res) => {
    const { url } = req.query;
    if (!url) {
        return res.status(400).send('URL is required');
    }

    if (url.startsWith('http://') || url.startsWith('https://')) {
        try {
            const response = await axios.get(url, { responseType: 'text' });
            res.send(response.data);
        } catch (error) {
            console.error('Error fetching URL:', error.message);
            res.status(500).send('Error fetching URL');
        }
    } else {
        // Handle local file path
        // Remove surrounding quotes if present (common when copying paths)
        const filePath = url.replace(/^"|"$/g, '');
        
        fs.readFile(filePath, 'utf8', (err, data) => {
            if (err) {
                console.error('Error reading local file:', err.message);
                return res.status(500).send('Error reading local file');
            }
            res.send(data);
        });
    }
});

app.get('/browse', async (req, res) => {
    let dirPath = req.query.path;

    // Handle root/drives request
    if (!dirPath) {
        if (process.platform === 'win32') {
            exec('wmic logicaldisk get name', (error, stdout, stderr) => {
                if (error) {
                    return res.status(500).json({ error: error.message });
                }
                const drives = stdout.split('\n')
                    .map(line => line.trim())
                    .filter(line => /^[A-Z]:$/.test(line));
                
                const items = drives.map(drive => ({
                    name: drive,
                    isDirectory: true,
                    path: drive + '\\\\'
                }));

                return res.json({
                    currentPath: '',
                    parentPath: null,
                    items: items
                });
            });
            return;
        } else {
            dirPath = '/';
        }
    }
    
    try {
        // Resolve the path to its canonical form (handling symlinks/junctions)
        const resolvedPath = await fs.promises.realpath(dirPath);
        
        const items = await fs.promises.readdir(resolvedPath, { withFileTypes: true });
        
        const result = await Promise.all(items.map(async (item) => {
            const fullPath = path.join(resolvedPath, item.name);
            let stats;
            try {
                stats = await fs.promises.stat(fullPath);
            } catch (e) {
                // Fallback for items we can't stat (e.g. permission denied)
                stats = { mtime: new Date(0), size: 0 };
            }
            
            return {
                name: item.name,
                isDirectory: item.isDirectory(),
                path: fullPath,
                mtime: stats.mtime,
                size: stats.size
            };
        }));
        
        // Sort: Directories first, then by date (newest first)
        result.sort((a, b) => {
            if (a.isDirectory === b.isDirectory) {
                // If both are dirs or both are files, sort by date descending
                return b.mtime - a.mtime;
            }
            // Dirs always before files
            return a.isDirectory ? -1 : 1;
        });

        let parentPath = path.dirname(resolvedPath);
        // Check if we are at root (e.g. C:\ or /)
        if (parentPath === resolvedPath) {
            parentPath = '';
        }

        res.json({
            currentPath: resolvedPath,
            parentPath: parentPath,
            items: result
        });
    } catch (error) {
        console.error(`Error reading directory ${dirPath}:`, error.message);
        res.status(500).json({ error: error.message });
    }
});

app.post('/shutdown', (req, res) => {
    console.log('Received shutdown signal');
    res.send('Shutting down');
    setTimeout(() => {
        process.exit(0);
    }, 100);
});

app.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}/`);
    open(`http://localhost:${PORT}/`);
});
