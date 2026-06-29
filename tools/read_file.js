const fs = require('fs');
const path = require('path');

module.exports = {
    name: "read_file",
    description: "Membaca isi teks dari sebuah file di laptop user.",
    parameters: { 
        type: "OBJECT", 
        properties: { 
            filePath: { type: "STRING", description: "Path file" } 
        }, 
        required: ["filePath"] 
    },
    execute: async (args) => {
        try {
            // Jika path relatif, arahkan ke folder workspace
            let targetPath = args.filePath;
            if (!path.isAbsolute(targetPath)) {
                targetPath = path.resolve(process.cwd(), 'workspace', targetPath);
            }
            
            const content = fs.readFileSync(targetPath, 'utf-8');
            let output = content;
            if (output.length > 5000) output = output.substring(0, 5000) + "\n...[DIPOTONG]";
            return { content: output };
        } catch (error) {
            return { error: error.message };
        }
    }
};
