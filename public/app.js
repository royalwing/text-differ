const urlInputs = [
    document.getElementById('url1'),
    document.getElementById('url2'),
    document.getElementById('url3')
];
const loadButtons = [
    document.getElementById('loadUrl1'),
    document.getElementById('loadUrl2'),
    document.getElementById('loadUrl3')
];
const clearButtons = [
    document.getElementById('clear1'),
    document.getElementById('clear2'),
    document.getElementById('clear3')
];

const diffOutput = document.getElementById('diff-output');
const exportBtn = document.getElementById('exportBtn');

let fileContents = ['', '', ''];
let worker;

// Initialize Worker
function initWorker() {
    // Check if we are in an exported file with embedded worker code
    const embeddedWorker = document.getElementById('worker-code');
    if (embeddedWorker) {
        const blob = new Blob([embeddedWorker.textContent], { type: 'application/javascript' });
        worker = new Worker(URL.createObjectURL(blob));
    } else {
        worker = new Worker('worker.js');
    }

    worker.onmessage = function(e) {
        const { id, diff, error } = e.data;
        if (error) {
            console.error('Worker error:', error);
            return;
        }
        renderDiff(id, diff);
    };
}

initWorker();

// State Management
function saveState() {
    try {
        const state = {
            urls: urlInputs.map(input => input.value)
            // We no longer save contents to avoid quota issues and to rely on paths
        };
        localStorage.setItem('text-differ-state', JSON.stringify(state));
    } catch (e) {
        console.warn('Failed to save state to localStorage', e);
    }
}

function loadState() {
    try {
        const saved = localStorage.getItem('text-differ-state');
        if (saved) {
            const state = JSON.parse(saved);
            if (state.urls) {
                state.urls.forEach((url, i) => {
                    if (urlInputs[i]) {
                        urlInputs[i].value = url;
                        // Automatically trigger load if a path/url is present
                        if (url) {
                            loadButtons[i].click();
                        }
                    }
                });
            }
        }
    } catch (e) {
        console.error('Failed to load state', e);
    }
}

// Check for embedded data (for exported file)
const embeddedDataElement = document.getElementById('embedded-data');
if (embeddedDataElement) {
    try {
        const embeddedData = JSON.parse(embeddedDataElement.textContent);
        fileContents = embeddedData.contents;
        // Hide file inputs in exported view as data is already loaded
        document.querySelector('.controls').style.display = 'none';
        // Add a header saying this is an export
        const header = document.createElement('h2');
        header.textContent = `Exported on ${new Date(embeddedData.date).toLocaleString()}`;
        header.style.textAlign = 'center';
        document.querySelector('.container').insertBefore(header, document.querySelector('.controls'));
        
        updateDiffs();
    } catch (e) {
        console.error('Failed to parse embedded data', e);
    }
}

// Add input listeners for URLs to save state
urlInputs.forEach(input => {
    input.addEventListener('input', saveState);
});

// Clear Buttons Logic
clearButtons.forEach((btn, index) => {
    if (btn) {
        btn.addEventListener('click', () => {
            if (urlInputs[index]) urlInputs[index].value = '';
            fileContents[index] = '';
            updateDiffs();
            saveState();
        });
    }
});

// Drag and Drop Logic
const fileInputContainers = document.querySelectorAll('.file-input');

fileInputContainers.forEach((container, index) => {
    // Prevent default drag behaviors
    ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
        container.addEventListener(eventName, preventDefaults, false);
    });

    // Highlight drop area
    container.addEventListener('dragenter', (e) => {
        e.preventDefault();
        e.stopPropagation();
        container.classList.add('drag-over');
    }, false);

    container.addEventListener('dragover', (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (!container.classList.contains('drag-over')) {
            container.classList.add('drag-over');
        }
    }, false);

    container.addEventListener('dragleave', (e) => {
        e.preventDefault();
        e.stopPropagation();
        // Only remove if we are leaving the container, not entering a child
        if (!container.contains(e.relatedTarget)) {
            container.classList.remove('drag-over');
        }
    }, false);

    container.addEventListener('drop', (e) => {
        e.preventDefault();
        e.stopPropagation();
        container.classList.remove('drag-over');
        handleDrop(e, index);
    }, false);
});

function preventDefaults(e) {
    e.preventDefault();
    e.stopPropagation();
}

function handleDrop(e, index) {
    const dt = e.dataTransfer;
    
    // 1. Check for dropped URL/Text first
    const droppedUrl = dt.getData('text/uri-list') || dt.getData('text/plain');
    if (droppedUrl && droppedUrl.trim()) {
        if (urlInputs[index]) {
            urlInputs[index].value = droppedUrl.trim();
            loadButtons[index].click();
        }
        return;
    }

    // 2. Check for dropped Files
    const files = dt.files;
    if (files.length > 0) {
        const file = files[0];
        
        // Try to get path if available (Electron/some configs)
        // Note: Standard browsers do not expose full path for security.
        // If file.path is available and looks like a full path (contains separators), use it.
        if (file.path && (file.path.includes('/') || file.path.includes('\\'))) {
            if (urlInputs[index]) {
                urlInputs[index].value = file.path;
                // Trigger load button to fetch via backend
                loadButtons[index].click();
            }
        } else {
            // Fallback: We only have the file object (bytes) and name.
            // We must read client-side.
            if (urlInputs[index]) {
                urlInputs[index].value = file.name; // Just for display
            }
            
            const reader = new FileReader();
            reader.onload = (event) => {
                fileContents[index] = event.target.result;
                updateDiffs();
                // We don't save state here because we might not have a persistent path
            };
            reader.readAsText(file);
        }
    }
}


loadButtons.forEach((btn, index) => {
    btn.addEventListener('click', () => {
        const url = urlInputs[index].value;
        if (url) {
            fetch(`/fetch?url=${encodeURIComponent(url)}`)
                .then(response => {
                    if (!response.ok) throw new Error('Network response was not ok');
                    return response.text();
                })
                .then(text => {
                    fileContents[index] = text;
                    updateDiffs();
                    saveState();
                })
                .catch(error => {
                    console.error('Error fetching URL:', error);
                    alert('Failed to fetch URL. Check console for details.');
                });
        }
    });
});

if (!embeddedDataElement) {
    // Check for initial files from command line arguments
    fetch('/api/initial-files')
        .then(response => response.json())
        .then(files => {
            if (files && files.length > 0) {
                // Load up to 3 files
                for (let i = 0; i < Math.min(files.length, 3); i++) {
                    urlInputs[i].value = files[i];
                    // Trigger load
                    loadButtons[i].click();
                }
            } else {
                // Only load saved state if no arguments provided
                loadState();
            }
        })
        .catch(error => {
            console.error('Error checking initial files:', error);
            loadState();
        });
}

function updateDiffs() {
    diffOutput.innerHTML = '';

    if (fileContents.every(c => !c)) return;

    // Diff 1 vs 2
    if (fileContents[0] && fileContents[1]) {
        requestDiff('File 1 vs File 2', fileContents[0], fileContents[1]);
    }

    // Only show comparisons with File 3 if it is present
    if (fileContents[2]) {
        // Diff 2 vs 3
        if (fileContents[1] && fileContents[2]) {
            requestDiff('File 2 vs File 3', fileContents[1], fileContents[2]);
        }

        // Diff 1 vs 3
        if (fileContents[0] && fileContents[2]) {
            requestDiff('File 1 vs File 3', fileContents[0], fileContents[2]);
        }
    }
}

function requestDiff(title, text1, text2) {
    // Create placeholder container
    const section = document.createElement('div');
    section.className = 'diff-section';
    section.id = `section-${title.replace(/\s+/g, '-')}`;

    const header = document.createElement('div');
    header.className = 'diff-header';
    header.textContent = title + ' (Calculating...)';
    section.appendChild(header);

    const contentDiv = document.createElement('div');
    contentDiv.className = 'diff-content';
    contentDiv.textContent = 'Loading...';
    section.appendChild(contentDiv);

    diffOutput.appendChild(section);

    worker.postMessage({ id: section.id, text1, text2 });
}

function highlightText(text) {
    if (!text) return '';
    try {
        return hljs.highlightAuto(text).value;
    } catch (e) {
        console.warn('Highlighting failed', e);
        // Fallback to escaping HTML special chars if highlighting fails
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
}

function renderDiff(sectionId, diff) {
    const section = document.getElementById(sectionId);
    if (!section) return;

    const header = section.querySelector('.diff-header');
    header.textContent = header.textContent.replace(' (Calculating...)', '');

    const contentDiv = section.querySelector('.diff-content');
    contentDiv.innerHTML = ''; // Clear loading text

    const table = document.createElement('table');
    table.className = 'diff-table';
    const tbody = document.createElement('tbody');
    table.appendChild(tbody);

    let oldLineNum = 1;
    let newLineNum = 1;

    const createRow = (text, type, oldNum, newNum) => {
        const tr = document.createElement('tr');
        if (type === 'added') tr.className = 'diff-row-added';
        if (type === 'removed') tr.className = 'diff-row-removed';
        
        const tdOld = document.createElement('td');
        tdOld.className = 'line-num';
        tdOld.textContent = oldNum || '';
        
        const tdNew = document.createElement('td');
        tdNew.className = 'line-num';
        tdNew.textContent = newNum || '';
        
        const tdContent = document.createElement('td');
        tdContent.className = 'line-content';
        tdContent.innerHTML = highlightText(text);
        
        tr.appendChild(tdOld);
        tr.appendChild(tdNew);
        tr.appendChild(tdContent);
        return tr;
    };

    diff.forEach((part) => {
        const lines = part.value.split('\n');
        if (lines[lines.length - 1] === '') lines.pop();

        // Collapse logic
        if (!part.added && !part.removed && lines.length > 6) {
            // Head
            for (let i = 0; i < 3; i++) {
                tbody.appendChild(createRow(lines[i], 'common', oldLineNum++, newLineNum++));
            }

            // Collapsed Row
            const trCollapsed = document.createElement('tr');
            const tdCollapsed = document.createElement('td');
            tdCollapsed.colSpan = 3;
            tdCollapsed.className = 'diff-collapsed-cell';
            trCollapsed.appendChild(tdCollapsed);
            
            // Store hidden rows data
            let hiddenRowsData = [];
            for (let i = 3; i < lines.length - 3; i++) {
                hiddenRowsData.push({
                    text: lines[i],
                    oldNum: oldLineNum++,
                    newNum: newLineNum++
                });
            }

            const renderCollapsedButtons = () => {
                tdCollapsed.innerHTML = '';
                const count = hiddenRowsData.length;
                if (count === 0) {
                    trCollapsed.remove();
                    return;
                }

                const container = document.createElement('div');
                container.style.display = 'flex';
                container.style.justifyContent = 'center';
                container.style.gap = '10px';
                container.style.alignItems = 'center';

                const text = document.createElement('span');
                text.textContent = `${count} hidden lines`;
                text.style.marginRight = '10px';
                text.style.color = '#858585';
                container.appendChild(text);

                if (count > 25) {
                    // Expand Down (Show next 25)
                    const btnDown = document.createElement('button');
                    btnDown.className = 'expand-btn';
                    btnDown.innerHTML = '&#9660; +25';
                    btnDown.title = 'Reveal next 25 lines';
                    btnDown.onclick = () => {
                        const chunk = hiddenRowsData.splice(0, 25);
                        const fragment = document.createDocumentFragment();
                        chunk.forEach(data => {
                            fragment.appendChild(createRow(data.text, 'common', data.oldNum, data.newNum));
                        });
                        trCollapsed.parentNode.insertBefore(fragment, trCollapsed);
                        renderCollapsedButtons();
                    };
                    container.appendChild(btnDown);
                }

                // Show All
                const btnAll = document.createElement('button');
                btnAll.className = 'expand-btn';
                btnAll.textContent = 'Show All';
                btnAll.onclick = () => {
                    const fragment = document.createDocumentFragment();
                    hiddenRowsData.forEach(data => {
                        fragment.appendChild(createRow(data.text, 'common', data.oldNum, data.newNum));
                    });
                    trCollapsed.parentNode.replaceChild(fragment, trCollapsed);
                };
                container.appendChild(btnAll);

                if (count > 25) {
                    // Expand Up (Show previous 25)
                    const btnUp = document.createElement('button');
                    btnUp.className = 'expand-btn';
                    btnUp.innerHTML = '&#9650; +25';
                    btnUp.title = 'Reveal previous 25 lines';
                    btnUp.onclick = () => {
                        const chunk = hiddenRowsData.splice(-25);
                        const fragment = document.createDocumentFragment();
                        chunk.forEach(data => {
                            fragment.appendChild(createRow(data.text, 'common', data.oldNum, data.newNum));
                        });
                        if (trCollapsed.nextSibling) {
                            trCollapsed.parentNode.insertBefore(fragment, trCollapsed.nextSibling);
                        } else {
                            trCollapsed.parentNode.appendChild(fragment);
                        }
                        renderCollapsedButtons();
                    };
                    container.appendChild(btnUp);
                }

                tdCollapsed.appendChild(container);
            };

            renderCollapsedButtons();
            tbody.appendChild(trCollapsed);

            // Tail
            for (let i = lines.length - 3; i < lines.length; i++) {
                tbody.appendChild(createRow(lines[i], 'common', oldLineNum++, newLineNum++));
            }
            return;
        }

        lines.forEach(line => {
            if (part.added) {
                tbody.appendChild(createRow(line, 'added', null, newLineNum++));
            } else if (part.removed) {
                tbody.appendChild(createRow(line, 'removed', oldLineNum++, null));
            } else {
                tbody.appendChild(createRow(line, 'common', oldLineNum++, newLineNum++));
            }
        });
    });

    contentDiv.appendChild(table);
}

exportBtn.addEventListener('click', async () => {
    const originalText = exportBtn.textContent;
    exportBtn.textContent = 'Generating Image...';
    exportBtn.disabled = true;

    try {
        const canvas = await html2canvas(diffOutput, {
            backgroundColor: '#1e1e1e', // Match dark theme background
            logging: false,
            scale: 2 // Higher quality
        });

        canvas.toBlob(async (blob) => {
            try {
                await navigator.clipboard.write([
                    new ClipboardItem({
                        'image/png': blob
                    })
                ]);
                
                // Notify user
                const notification = document.createElement('div');
                notification.textContent = 'Diff copied to clipboard!';
                notification.style.cssText = `
                    position: fixed;
                    bottom: 20px;
                    right: 20px;
                    background: #4caf50;
                    color: white;
                    padding: 10px 20px;
                    border-radius: 4px;
                    z-index: 1000;
                    animation: fadeOut 3s forwards;
                `;
                document.body.appendChild(notification);
                
                // Add animation style if not exists
                if (!document.getElementById('notification-style')) {
                    const style = document.createElement('style');
                    style.id = 'notification-style';
                    style.textContent = `
                        @keyframes fadeOut {
                            0% { opacity: 1; }
                            70% { opacity: 1; }
                            100% { opacity: 0; }
                        }
                    `;
                    document.head.appendChild(style);
                }

                setTimeout(() => {
                    notification.remove();
                }, 3000);

            } catch (err) {
                console.error('Failed to write to clipboard:', err);
                alert('Failed to copy to clipboard. See console for details.');
            } finally {
                exportBtn.textContent = originalText;
                exportBtn.disabled = false;
            }
        });
    } catch (err) {
        console.error('Screen render failed:', err);
        alert('Failed to generate image. See console for details.');
        exportBtn.textContent = originalText;
        exportBtn.disabled = false;
    }
});

// File Browser Logic
const modal = document.getElementById('fileBrowserModal');
const closeBtn = document.querySelector('.close-modal');
const cancelBtn = document.getElementById('browserCancelBtn');
const browserList = document.getElementById('browserList');
const currentPathDisplay = document.getElementById('browserCurrentPath');
let currentBrowserInputIndex = -1;

// Browse buttons
const browseButtons = [
    document.getElementById('browse1'),
    document.getElementById('browse2'),
    document.getElementById('browse3')
];

browseButtons.forEach((btn, index) => {
    if (btn) {
        btn.addEventListener('click', () => openFileBrowser(index));
    }
});

function closeModal() {
    modal.style.display = 'none';
}

if (closeBtn) closeBtn.onclick = closeModal;
if (cancelBtn) cancelBtn.onclick = closeModal;

window.onclick = function(event) {
    if (event.target == modal) {
        closeModal();
    }
}

function openFileBrowser(index) {
    currentBrowserInputIndex = index;
    modal.style.display = 'block';
    
    // Try to use current value as start path, else root
    let startPath = urlInputs[index].value.trim();
    
    // If it's a URL or empty, start at root
    if (!startPath || startPath.startsWith('http')) {
        startPath = '';
    }
    
    loadDirectory(startPath);
}

async function loadDirectory(path) {
    try {
        const url = `/browse?path=${encodeURIComponent(path)}`;
        const response = await fetch(url);
        
        if (!response.ok) {
            // If it fails (e.g. path is a file), try loading the parent or root
            if (path) {
                console.warn('Failed to load path, trying root');
                return loadDirectory('');
            }
            throw new Error('Failed to load directory');
        }
        
        const data = await response.json();
        renderBrowserItems(data);
    } catch (error) {
        console.error('Error loading directory:', error);
        browserList.innerHTML = `<div style="padding:10px; color: #f48771">Error: ${error.message}</div>`;
    }
}

function renderBrowserItems(data) {
    const { currentPath, parentPath, items } = data;
    
    currentPathDisplay.textContent = currentPath || 'Computer';
    browserList.innerHTML = '';
    browserList.scrollTop = 0; // Reset scroll to top

    // Add '..' for parent directory if we are not at root
    // parentPath can be empty string (for drive list), so check for null/undefined
    if (parentPath !== null && parentPath !== undefined && parentPath !== currentPath) {
        const parentItem = document.createElement('div');
        parentItem.className = 'browser-item folder';
        parentItem.innerHTML = '<span class="browser-icon">📁</span> ..';
        parentItem.onclick = () => loadDirectory(parentPath);
        browserList.appendChild(parentItem);
    }

    items.forEach(item => {
        const div = document.createElement('div');
        div.className = `browser-item ${item.isDirectory ? 'folder' : 'file'}`;
        const icon = item.isDirectory ? '📁' : '📄';
        
        // Format date and size
        let dateStr = '';
        let sizeStr = '';
        
        if (item.mtime) {
            dateStr = new Date(item.mtime).toLocaleString();
            if (!item.isDirectory) {
                const size = item.size;
                if (size < 1024) sizeStr = size + ' B';
                else if (size < 1024 * 1024) sizeStr = (size / 1024).toFixed(1) + ' KB';
                else sizeStr = (size / (1024 * 1024)).toFixed(1) + ' MB';
            }
        }

        div.innerHTML = `
            <div class="browser-col-name"><span class="browser-icon">${icon}</span> ${item.name}</div>
            <div class="browser-col-date">${dateStr}</div>
            <div class="browser-col-size">${sizeStr}</div>
        `;
        
        div.onclick = () => {
            if (item.isDirectory) {
                loadDirectory(item.path);
            } else {
                selectFile(item.path);
            }
        };
        
        browserList.appendChild(div);
    });
}

function selectFile(path) {
    if (currentBrowserInputIndex >= 0 && currentBrowserInputIndex < urlInputs.length) {
        const input = urlInputs[currentBrowserInputIndex];
        input.value = path;
        closeModal();
        
        // Trigger load automatically
        loadButtons[currentBrowserInputIndex].click();
        
        // Save state
        saveState();
    }
}

// Shutdown server when page is closed
window.addEventListener('beforeunload', () => {
    // Use navigator.sendBeacon if available for reliable delivery on unload
    if (navigator.sendBeacon) {
        navigator.sendBeacon('/shutdown');
    } else {
        fetch('/shutdown', { method: 'POST', keepalive: true });
    }
});
