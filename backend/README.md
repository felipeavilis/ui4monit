# UI4Monit Backend

Backend server for UI4Monit — compatible with the Monit protocol.

## Structure

```
backend/
├── src/
│   ├── config/
│   │   └── database.js       # PostgreSQL configuration
│   ├── parsers/
│   │   └── monitParser.js    # Monit XML Parser
│   ├── services/
│   │   └── collectorService.js  # Collector logic
│   ├── routes/
│   │   ├── collector.js      # Endpoint for Monit
│   │   └── api.js           # REST APIs
│   └── server.js            # Express server
├── package.json
├── Dockerfile
└── .env.example
```

## Local Installation

```bash
cd backend
npm install
cp .env.example .env

# Edit .env with your specific settings

npm run dev
```

## Docker

```bash
# From the project root
docker-compose up -d
```

## Endpoints

### Collector (Monit sends data here)

**POST /collector**
- Receives XML from Monit
- Processes and stores data in the database
- Returns: `200 OK`

### APIs REST

**GET /api/hosts**
- Lists all monitored hosts
- Response:
```json
[
  {
    "id": "1234567890",
    "hostname": "server1",
    "status": 0,
    "service_count": 10,
    "service_issues": 0
  }
]
```

**GET /api/hosts/:id**
- Details for a specific host

**GET /api/hosts/:id/services**
- Lists services for a specific host

**GET /api/events**
- Lists recent events
- Query params: `?hostid=123&limit=50`

**GET /api/statistics/:serviceid**
- Service statistics
- Query params: `?from=timestamp&to=timestamp&descriptor=cpu_user`

**GET /api/dashboard**
- Dashboard summary

**GET /health**
- Server health check

## Monit Config

In your Monit instance, add the following to `/etc/monit/monitrc`:

```
set mmonit http://YOUR-IP:8705/collector
```

Then restart Monit:
```bash
monit reload
```

## Stored Data

The backend stores:

1. **Hosts**: Server information
2. **Services**: Monitored services (system, process, filesystem, etc.)
3. **Events**: Events and alerts
4. **Statistics**: Historical metrics (CPU, RAM, Load, etc.)

## Monit XML Format

Example of a payload sent by Monit:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<monit>
  <server>
    <localhostname>server1</localhostname>
    <version>5.33.0</version>
    <uptime>123456</uptime>
    <poll>120</poll>
    <httpd>
      <address>0.0.0.0</address>
      <port>2812</port>
    </httpd>
  </server>
  <platform>
    <name>Linux</name>
    <cpu>4</cpu>
    <memory>8192000</memory>
  </platform>
  <service type="5">
    <name>system</name>
    <status>0</status>
    <system>
      <load><avg01>0.5</avg01></load>
      <cpu><user>10.5</user></cpu>
      <memory><percent>45.2</percent></memory>
    </system>
  </service>
</monit>
```

## Development

### Adding a New Service Type

1. Edit `parsers/monitParser.js` to extract the data.
2. Update `services/collectorService.js` to process it.
3. Create a new query in `routes/api.js` if necessary.

