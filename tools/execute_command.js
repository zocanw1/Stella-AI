const { exec } = require('child_process');

module.exports = {
    name: "execute_command",
    description: "Menjalankan perintah terminal/CLI di sistem (Windows).",
    parameters: { 
        type: "OBJECT", 
        properties: { 
            command: { type: "STRING", description: "Perintah CLI" } 
        }, 
        required: ["command"] 
    },
    execute: async (args) => {
        return new Promise((resolve) => {
            // cwd is set to process.cwd() or a specific directory if needed
            // Currently using process.cwd() or we can pass __dirname from the main file
            exec(args.command, { cwd: process.cwd() }, (error, stdout, stderr) => {
                let output = "";
                if (error) output += `ERROR:\n${error.message}\n`;
                if (stderr) output += `STDERR:\n${stderr}\n`;
                if (stdout) output += `STDOUT:\n${stdout}\n`;
                if (!output) output = "Perintah berhasil dieksekusi tanpa output.";
                if (output.length > 5000) output = output.substring(0, 5000) + "\n...[DIPOTONG]";
                resolve({ output });
            });
        });
    }
};
