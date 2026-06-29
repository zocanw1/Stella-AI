const fs = require('fs');
const path = require('path');

module.exports = {
    name: "write_file",
    description: "Membuat file baru atau menimpa file lama.",
    parameters: { 
        type: "OBJECT", 
        properties: { 
            filePath: { type: "STRING", description: "Path file" }, 
            content: { type: "STRING", description: "Isi file" } 
        }, 
        required: ["filePath", "content"] 
    },
    execute: async (args) => {
        try {
            // Jika path relatif, arahkan ke folder workspace
            let targetPath = args.filePath;
            if (!path.isAbsolute(targetPath)) {
                targetPath = path.resolve(process.cwd(), 'workspace', targetPath);
            }
            const dir = path.dirname(targetPath);
            if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
            fs.writeFileSync(targetPath, args.content, 'utf-8');
            return { success: true, message: "File berhasil ditulis." };
        } catch (error) {
            return { error: error.message };
        }
    }
};
