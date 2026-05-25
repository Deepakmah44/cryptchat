# Use standard lightweight official Node Alpine image
FROM node:18-alpine

# Set secure working directory inside container
WORKDIR /usr/src/app

# Copy dependency configuration files
COPY package*.json ./

# Install production dependencies only for optimal footprint
RUN npm ci --only=production

# Copy application source files
COPY . .

# Expose server listener port
EXPOSE 3000

# Set environment variables for production
ENV NODE_ENV=production

# Run standard server start command
CMD [ "npm", "start" ]
