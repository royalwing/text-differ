importScripts('https://cdnjs.cloudflare.com/ajax/libs/jsdiff/5.1.0/diff.min.js');

self.onmessage = function(e) {
    const { id, text1, text2 } = e.data;
    
    try {
        const diff = Diff.diffLines(text1 || '', text2 || '');
        self.postMessage({ id, diff });
    } catch (error) {
        self.postMessage({ id, error: error.message });
    }
};
