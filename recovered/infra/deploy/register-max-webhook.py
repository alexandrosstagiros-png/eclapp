#!/usr/bin/env python3
"""Register the production MAX callback endpoint after application readiness.

Reads secrets only from the existing root-only environment file. Does not send
messages, change bot commands, or replace any different webhook subscription.
"""
import json, os, pathlib, ssl, urllib.error, urllib.request

if os.geteuid() != 0:
    raise SystemExit('Run as root on the application host')
env = dict(line.split('=', 1) for line in pathlib.Path('/etc/transport-miniapp.env').read_text().splitlines()
           if '=' in line and not line.lstrip().startswith('#'))
token = env['MAX_BOT_TOKEN']
secret = env['MAX_WEBHOOK_SECRET']
url = 'https://170.168.112.23/api/v1/integrations/max/webhook'
types = ['bot_started', 'bot_stopped', 'dialog_muted', 'dialog_unmuted', 'dialog_removed', 'message_callback']
context = ssl.create_default_context()
context.load_verify_locations(cafile=env['MAX_CA_FILE'])

def request(target, method='GET', body=None, headers=None, api=False):
    data = None if body is None else json.dumps(body).encode()
    req = urllib.request.Request(target, method=method, data=data, headers=headers or {})
    with urllib.request.urlopen(req, context=context if api else ssl.create_default_context(), timeout=20) as response:
        if response.status != 200:
            raise RuntimeError('Unexpected HTTP status')
        return json.load(response)

headers = {'Authorization': token, 'Content-Type': 'application/json'}
before = request('https://platform-api2.max.ru/subscriptions', headers=headers, api=True)
if any(item.get('url') != url for item in before.get('subscriptions', [])):
    raise SystemExit('Different existing webhook found; no subscription changed')
# An empty update cannot create a business notice or message. Verify secret
# handling through the public HTTPS route before enabling MAX delivery.
try:
    request(url, 'POST', {}, {'Content-Type': 'application/json', 'X-Max-Bot-Api-Secret': 'invalid-probe'})
    raise RuntimeError('Webhook accepted an invalid secret')
except urllib.error.HTTPError as error:
    if error.code != 401:
        raise RuntimeError('Webhook rejection status differs') from None
request(url, 'POST', {}, {'Content-Type': 'application/json', 'X-Max-Bot-Api-Secret': secret})
result = request('https://platform-api2.max.ru/subscriptions', 'POST',
                 {'url': url, 'update_types': types, 'secret': secret}, headers, True)
if result.get('success') is not True:
    raise RuntimeError('MAX did not confirm registration')
after = request('https://platform-api2.max.ru/subscriptions', headers=headers, api=True)
matching = [item for item in after.get('subscriptions', []) if item.get('url') == url]
if not matching or set(matching[0].get('update_types', [])) != set(types):
    raise RuntimeError('Registered subscription readback differs')
print(json.dumps({'registered': True, 'url': url, 'updateTypes': types,
                  'publicTlsAndSecretCheck': 'passed', 'messagesSent': 0}))
