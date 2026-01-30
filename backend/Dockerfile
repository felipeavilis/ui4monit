FROM node:20-alpine

# Install cron and postgresql client
RUN apk add --no-cache dcron postgresql-client

WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .

# Copy cron script and entrypoint
COPY ./scripts/docker-entrypoint.sh /usr/local/bin/
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

# Create cron directory, log directory and script
RUN mkdir -p /etc/cron.d /var/log
COPY ./scripts/check-offline-hosts.sh /usr/local/bin/
RUN chmod +x /usr/local/bin/check-offline-hosts.sh

# Setup crontab (dcron format for Alpine)
# Format: minute hour day month weekday command
RUN echo "*/2 * * * * /usr/local/bin/check-offline-hosts.sh >> /var/log/cron.log 2>&1" | crontab -

EXPOSE 8705
ENTRYPOINT ["/usr/local/bin/docker-entrypoint.sh"]
CMD ["npm", "run", "dev"]
