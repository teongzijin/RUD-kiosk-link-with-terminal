module.exports = {
  apps: [{
    name: "RUD-IM30-Gateway",
    script: "./dist/server.js",
    instances: 1,
    autorestart: true,
    // Critical for Kiosk: delays restart to allow hardware drivers to initialize
    restart_delay: 20000, 
    watch: false,
    max_memory_restart: '200M',
    env: {
      NODE_ENV: "production",
    }
  }]
}
