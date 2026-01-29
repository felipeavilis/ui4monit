#!/usr/bin/env node

/**
 * Test script to simulate Monit sending data to the collector
 * Usage: node test-collector.js
 */

const http = require('http');

const testXml = `<?xml version="1.0" encoding="UTF-8"?>
<monit>
  <server>
    <uptime>86400</uptime>
    <poll>120</poll>
    <startdelay>0</startdelay>
    <localhostname>test-server-1</localhostname>
    <controlfile>/etc/monit/monitrc</controlfile>
    <httpd>
      <address>0.0.0.0</address>
      <port>2812</port>
      <ssl>0</ssl>
    </httpd>
    <id>abc123def456</id>
    <incarnation>1706543210</incarnation>
    <version>5.33.0</version>
  </server>
  <platform>
    <name>Linux</name>
    <release>5.15.0-91-generic</release>
    <version>#101-Ubuntu SMP</version>
    <machine>x86_64</machine>
    <cpu>8</cpu>
    <memory>16384000</memory>
    <swap>4096000</swap>
  </platform>
  <service type="5">
    <name>system</name>
    <status>0</status>
    <status_hint>0</status_hint>
    <monitor>1</monitor>
    <monitormode>0</monitormode>
    <onreboot>0</onreboot>
    <collected_sec>1706634789</collected_sec>
    <collected_usec>123456</collected_usec>
    <system>
      <load>
        <avg01>1.25</avg01>
        <avg05>1.10</avg05>
        <avg15>0.95</avg15>
      </load>
      <cpu>
        <user>25.5</user>
        <system>10.2</system>
        <wait>2.1</wait>
      </cpu>
      <memory>
        <percent>45.8</percent>
        <kilobyte>7500800</kilobyte>
      </memory>
      <swap>
        <percent>5.2</percent>
        <kilobyte>212992</kilobyte>
      </swap>
    </system>
  </service>
  <service type="3">
    <name>nginx</name>
    <status>0</status>
    <status_hint>0</status_hint>
    <monitor>1</monitor>
    <monitormode>0</monitormode>
    <onreboot>0</onreboot>
    <collected_sec>1706634789</collected_sec>
    <collected_usec>123456</collected_usec>
    <process>
      <pid>1234</pid>
      <ppid>1</ppid>
      <uptime>86400</uptime>
      <children>4</children>
      <memory>
        <percent>2.5</percent>
        <kilobyte>409600</kilobyte>
      </memory>
      <cpu>
        <percent>5.2</percent>
      </cpu>
    </process>
  </service>
  <service type="0">
    <name>rootfs</name>
    <status>0</status>
    <status_hint>0</status_hint>
    <monitor>1</monitor>
    <monitormode>0</monitormode>
    <onreboot>0</onreboot>
    <collected_sec>1706634789</collected_sec>
    <collected_usec>123456</collected_usec>
    <block>
      <percent>65.3</percent>
      <usage>67108864</usage>
      <total>102400000</total>
    </block>
  </service>
</monit>`;

const options = {
  hostname: 'localhost',
  port: 3001,
  path: '/collector',
  method: 'POST',
  headers: {
    'Content-Type': 'text/xml',
    'Content-Length': Buffer.byteLength(testXml)
  }
};

console.log('Sending test data to collector...\n');

const req = http.request(options, (res) => {
  console.log(`Status: ${res.statusCode}`);
  console.log(`Headers: ${JSON.stringify(res.headers)}\n`);
  
  let data = '';
  
  res.on('data', (chunk) => {
    data += chunk;
  });
  
  res.on('end', () => {
    console.log('Response:', data);
    console.log('\n✅ Test completed! Check http://localhost:3001/api/hosts');
  });
});

req.on('error', (error) => {
  console.error('❌ Error:', error.message);
  console.log('\nMake sure the backend is running:');
  console.log('  docker-compose up -d');
});

req.write(testXml);
req.end();
