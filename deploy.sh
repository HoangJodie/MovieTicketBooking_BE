#!/bin/bash

# Pull code mới
git pull

# Install dependencies
npm install

# Build
npm run build

# Reload PM2
pm2 reload ticketbooking-api

# Hoặc restart nếu cần
# pm2 restart ticketbooking-api 