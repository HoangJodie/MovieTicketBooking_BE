module.exports = {
  apps: [{
    name: 'ticketbooking-api',
    script: 'dist/main.js',
    instances: 'max',
    exec_mode: 'cluster',
    watch: false,
    env_development: {
      NODE_ENV: 'development',
      watch: true,
      ignore_watch: ['node_modules', 'logs']
    },
    env_production: {
      NODE_ENV: 'production',
      watch: false
    }
  }]
}; 