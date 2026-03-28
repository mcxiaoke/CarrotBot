module.exports = {
    apps: [
        {
            name: 'carrotbot',
            script: 'dist/index.js',
            instances: 1,
            autorestart: true,
            watch: false,
            max_memory_restart: '500M',
            env: {
                NODE_ENV: 'production',
                LOG_LEVEL: 'info',
            },
            env_file: '.env',
            error_file: 'logs/error.log',
            out_file: 'logs/out.log',
            log_file: 'logs/combined.log',
            time: true,
        },
    ],
}
