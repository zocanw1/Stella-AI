const SKILL_REGISTRY = {
    conversation: {
        name: 'Conversation', category: 'core', tools: [],
        description: 'Natural conversation and chat',
        prerequisites: []
    },
    web_search: {
        name: 'Web Search', category: 'research', tools: ['search_web'],
        description: 'Search information on the web',
        prerequisites: []
    },
    file_management: {
        name: 'File Management', category: 'system', tools: ['read_file', 'write_file', 'download_file'],
        description: 'Read, write, and manage files',
        prerequisites: []
    },
    code_execution: {
        name: 'Code Execution', category: 'technical', tools: ['execute_command'],
        description: 'Execute code and commands in terminal',
        prerequisites: ['file_management']
    },
    image_generation: {
        name: 'Image Generation', category: 'creative', tools: ['generate_image', 'send_media'],
        description: 'Generate and send images',
        prerequisites: []
    },
    voice_generation: {
        name: 'Voice Generation', category: 'creative', tools: ['generate_voice', 'send_media'],
        description: 'Generate and send voice notes',
        prerequisites: []
    },
    web_screenshot: {
        name: 'Web Screenshot', category: 'research', tools: ['screenshot_web'],
        description: 'Take screenshots of web pages',
        prerequisites: []
    },
    web_research: {
        name: 'Web Research', category: 'research', tools: ['search_web', 'fetch_webpage'],
        description: 'Deep research on web topics',
        prerequisites: ['web_search']
    },
    system_administration: {
        name: 'System Admin', category: 'technical', tools: ['execute_command', 'check_system'],
        description: 'System administration tasks',
        prerequisites: ['code_execution']
    },
    multimedia: {
        name: 'Multimedia', category: 'creative', tools: ['generate_image', 'generate_voice', 'send_media'],
        description: 'Full multimedia creation and delivery',
        prerequisites: ['image_generation', 'voice_generation']
    },
    planning: {
        name: 'Planning', category: 'cognitive', tools: [],
        description: 'Plan and organize multi-step tasks',
        prerequisites: []
    },
    research_analysis: {
        name: 'Research Analysis', category: 'cognitive', tools: ['search_web', 'fetch_webpage', 'read_file'],
        description: 'Analyze and synthesize research findings',
        prerequisites: ['web_research']
    },
    workflow: {
        name: 'Workflow', category: 'cognitive', tools: [],
        description: 'Execute multi-step workflows',
        prerequisites: ['planning']
    },
    deploy: {
        name: 'Deployment', category: 'technical', tools: ['execute_command', 'read_file', 'write_file'],
        description: 'Deploy applications and services',
        prerequisites: ['system_administration', 'code_execution']
    },
    debugging: {
        name: 'Debugging', category: 'technical', tools: ['execute_command', 'read_file'],
        description: 'Debug code and system issues',
        prerequisites: ['code_execution', 'file_management']
    }
};

module.exports = { SKILL_REGISTRY };
