#!/usr/bin/env python3
"""Prepare and deliver approved original comic files without browser upload."""
import argparse
import hashlib
import json
import re
import sys
import time
import uuid
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.request import Request, build_opener, HTTPRedirectHandler

ORIGIN = 'https://comics.nadmo.id'
MAX_BYTES = 20 * 1024 * 1024
EXT = {'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/avif': 'avif'}


class PublishError(Exception):
    pass


class NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        raise PublishError('Unexpected redirect; no upload was forwarded')


def require(value, message):
    if not value:
        raise PublishError(message)


def emit(value):
    print(json.dumps(value, ensure_ascii=False), flush=True)


def request(path, body=None, headers=None, raw=False):
    require(path.startswith('/') and not path.startswith('//'), 'Invalid site path')
    req = Request(ORIGIN + path, data=body, headers={
        'Origin': ORIGIN, 'Accept': 'application/json',
        'User-Agent': 'AM-STUDIO-Publisher/1.1', **(headers or {})},
        method='GET' if body is None else 'POST')
    for attempt in range(4):
        try:
            with build_opener(NoRedirect()).open(req, timeout=45) as response:
                data = response.read(MAX_BYTES + 1)
                require(len(data) <= MAX_BYTES, 'Response exceeds size limit')
                return data if raw else json.loads(data)
        except HTTPError as error:
            detail = error.read(4096).decode('utf-8', 'replace')
            if error.code in (429, 502, 503, 504) and attempt < 3:
                emit({'status': 'RETRYING', 'http_status': error.code})
                time.sleep(20 if error.code == 429 else 2 ** attempt)
                continue
            raise PublishError('HTTP ' + str(error.code) + ': ' + detail) from None
        except URLError:
            if attempt == 3:
                raise PublishError('Network request failed; resume the same upload plan') from None
            time.sleep(2 ** attempt)
    raise PublishError('Request did not finish')


def describe(path):
    path = Path(path).resolve(strict=True)
    require(path.is_file() and 0 < path.stat().st_size <= MAX_BYTES, 'Invalid original file size')
    data = path.read_bytes()
    if data.startswith(b'\x89PNG\r\n\x1a\n'):
        mime = 'image/png'
    elif data.startswith(b'\xff\xd8\xff'):
        mime = 'image/jpeg'
    elif data[:4] == b'RIFF' and data[8:12] == b'WEBP':
        mime = 'image/webp'
    elif data[4:8] == b'ftyp' and b'avif' in data[8:32]:
        mime = 'image/avif'
    else:
        raise PublishError('Unsupported original image signature: ' + path.name)
    return {'content_type': mime, 'size': len(data), 'sha256': hashlib.sha256(data).hexdigest()}


def descriptors(manifest):
    return ([manifest['cover']] if manifest.get('cover') else []) + manifest['pages']


def validate(manifest, passport):
    require(manifest.get('version') == 1, 'Manifest version must be 1')
    require(bool(re.fullmatch(r'[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}', manifest.get('id', ''))), 'Invalid release ID')
    require(manifest.get('comic_id') == passport['comic_id'] and manifest.get('channel_id') == passport['channel_id'], 'Comic/channel must match the current passport')
    require(manifest.get('owner_approved') is True and manifest.get('qc') == 'QC_PASS' and manifest.get('canon_state') == 'CANON_FINAL', 'Owner approval and canon QC must already exist')
    for field in ('approval_reference', 'reason'):
        require(isinstance(manifest.get(field), str) and len(manifest[field].strip()) >= 10, 'Missing ' + field)
    require(isinstance(manifest.get('title'), str) and 2 <= len(manifest['title'].strip()) <= 180, 'Invalid title')
    pages = manifest.get('pages')
    require(isinstance(pages, list) and len(pages) <= 999 and manifest.get('page_count') == len(pages), 'Invalid page count')
    require([p.get('number') for p in pages] == list(range(1, len(pages) + 1)), 'Page numbers must be contiguous and approved')
    kind, episode = manifest.get('type'), manifest.get('episode')
    require(type(episode) is int and ((kind == 'COVER' and episode == 0 and not pages and manifest.get('cover')) or (kind == 'EPISODE' and 1 <= episode <= 999 and pages)), 'Invalid cover/episode package')
    for asset in descriptors(manifest):
        require(asset.get('content_type') in EXT and type(asset.get('size')) is int and 0 < asset['size'] <= MAX_BYTES and bool(re.fullmatch(r'[a-f0-9]{64}', asset.get('sha256', ''))), 'Invalid asset descriptor')


def prepare(spec, out, existing=None):
    comic = (existing or spec).get('comic_id', '')
    require(bool(re.fullmatch(r'[a-z0-9-]{1,80}', comic)), 'Invalid Comic ID')
    passport = request('/publisher/passports/' + comic + '.json')
    if existing:
        manifest = existing
        paths = spec['files']
    else:
        paths = ([spec['cover']] if spec.get('cover') else []) + spec.get('pages', [])
        assets = [describe(path) for path in paths]
        offset = 1 if spec.get('cover') else 0
        manifest = {key: spec[key] for key in ('type', 'comic_id', 'channel_id', 'episode', 'title', 'owner_approved', 'canon_state', 'qc', 'approval_reference', 'reason')}
        manifest.update(version=1, id=spec.get('id') or str(uuid.uuid4()), page_count=len(spec.get('pages', [])), pages=[dict(a, number=n + 1) for n, a in enumerate(assets[offset:])])
        if offset:
            manifest['cover'] = assets[0]
    validate(manifest, passport)
    expected = descriptors(manifest)
    require(len(paths) == len(expected), 'One source entry per approved asset is required')
    sources = []
    for path, descriptor in zip(paths, expected):
        if descriptor.get('reuse_existing'):
            require(path is None, 'Use null for approved reuse_existing assets')
            sources.append(None)
        else:
            require(path is not None, 'Missing original file')
            actual = describe(path)
            require(all(actual[key] == descriptor[key] for key in actual), 'Original does not match the approved manifest')
            sources.append(str(Path(path).resolve()))
    out = Path(out)
    out.mkdir(parents=True, exist_ok=False)
    manifest_path = out / 'manifest.json'
    manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, separators=(',', ':')), encoding='utf-8')
    plan_path = out / 'upload-plan.json'
    plan_path.write_text(json.dumps({'manifest': manifest, 'files': sources}, ensure_ascii=False, indent=2), encoding='utf-8')
    emit({'status': 'PREPARED', 'id': manifest['id'], 'comic_id': comic, 'manifest': str(manifest_path.resolve()), 'plan': str(plan_path.resolve()), 'next': 'Write this approved manifest through authenticated Cloudflare, then run upload with this plan'})
    return {'manifest': manifest, 'files': sources}


def check_target(data, manifest):
    for key in ('id', 'comic_id', 'channel_id', 'episode', 'title'):
        require(data.get(key) == manifest[key], 'Release target mismatch: ' + key)


def asset_url(manifest, index):
    asset = descriptors(manifest)[index]
    cover = bool(manifest.get('cover')) and index == 0
    path = 'cover' if cover else 'ep%03d/page-%02d' % (manifest['episode'], asset['number'])
    return ORIGIN + '/media/comics/' + manifest['comic_id'] + '/' + path + '.' + EXT[asset['content_type']]


def verify_receipt(receipt, manifest):
    check_target(receipt, manifest)
    require(receipt.get('status') == 'PUBLISHED' and receipt.get('page_count') == manifest['page_count'], 'Release has no published receipt')
    assets = descriptors(manifest)
    require(len(receipt.get('assets', [])) == len(assets), 'Receipt asset count mismatch')
    verification = []
    for index, (actual, expected) in enumerate(zip(receipt['assets'], assets)):
        require(actual.get('url') == asset_url(manifest, index) and actual.get('size') == expected['size'] and actual.get('sha256') == expected['sha256'], 'Receipt asset mismatch')
        path = actual['url'][len(ORIGIN):]
        try:
            data = request(path, raw=True)
        except PublishError as error:
            if actual.get('kind') == 'PAGE' and str(error).startswith('HTTP 402:') and 'MEMBERSHIP_REQUIRED' in str(error):
                verification.append({'url': actual['url'], 'storage': 'VERIFIED_SERVER_RECEIPT', 'public_access': 'MEMBERSHIP_REQUIRED'})
                continue
            raise
        require(len(data) == expected['size'] and hashlib.sha256(data).hexdigest() == expected['sha256'], 'Public original-byte verification failed')
        verification.append({'url': actual['url'], 'public_bytes': 'SHA256_MATCH'})
    catalog = request('/catalog.json')
    series = next((s for s in catalog.get('series', []) if s.get('id') == manifest['comic_id']), None)
    require(series is not None, 'Comic not visible in catalog')
    if manifest.get('cover'):
        require(series.get('cover', {}).get('asset') == asset_url(manifest, 0)[len(ORIGIN):], 'Catalog cover mismatch')
    if manifest['type'] == 'EPISODE':
        registry = request('/reader-assets.json')
        episode = next((e for e in registry.get('episodes', []) if e.get('seriesId') == manifest['comic_id'] and e.get('episode') == manifest['episode']), None)
        require(episode is not None and episode.get('pageCount') == manifest['page_count'], 'Reader episode verification failed')
    return verification


def upload(plan):
    manifest, files = plan['manifest'], plan['files']
    validate(manifest, request('/publisher/passports/' + manifest['comic_id'] + '.json'))
    require(len(files) == len(descriptors(manifest)), 'Source count mismatch')
    # Check every local source before any remote write.
    payloads = []
    for path, expected in zip(files, descriptors(manifest)):
        if expected.get('reuse_existing'):
            require(path is None, 'Reuse must not substitute a local file')
            payloads.append(None)
        else:
            actual = describe(path)
            require(all(actual[key] == expected[key] for key in actual), 'Original file changed after approval')
            payloads.append(path)
    base = '/api/publisher/'
    release = request(base + 'releases/' + manifest['id'])
    check_target(release, manifest)
    if release.get('status') != 'PUBLISHED':
        require(len(release.get('assets', [])) == len(files), 'Approved server asset count mismatch')
        for current, expected in zip(release['assets'], descriptors(manifest)):
            require(all(current.get(k) == expected[k] for k in ('sha256', 'size', 'content_type')), 'Approved server descriptor mismatch')
        headers = {'X-AM-Comic-ID': manifest['comic_id'], 'X-AM-Channel-ID': manifest['channel_id']}
        for index, (path, descriptor) in enumerate(zip(payloads, descriptors(manifest))):
            if path is None:
                continue
            data = Path(path).read_bytes()
            require(len(data) == descriptor['size'] and hashlib.sha256(data).hexdigest() == descriptor['sha256'], 'Original changed during upload')
            result = request(base + 'uploads/' + manifest['id'] + '/' + str(index), data, {**headers, 'Content-Type': descriptor['content_type']})
            require(result.get('staged') is True and result.get('sha256') == descriptor['sha256'], 'Upload was not verified')
            emit({'status': 'STAGED', 'asset': index, 'bytes': len(data)})
        for _ in range((len(files) + 3) // 4 + 40):
            release = request(base + 'process/' + manifest['id'], b'{}', {**headers, 'Content-Type': 'application/json'})
            if release.get('status') == 'PUBLISHED':
                break
            require(release.get('status') == 'PROCESSING', 'Unexpected processing state')
            emit({'status': 'PROCESSING', 'next_asset': release.get('next_asset')})
            time.sleep(min(max(release.get('retry_after', 1), 1), 5))
        else:
            raise PublishError('Still processing; resume the SAME upload plan')
    verification = verify_receipt(release, manifest)
    return {'ok': True, 'status': 'PUBLISHED_AND_VERIFIED', 'receipt': release, 'verification': verification}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest='command', required=True)
    p = sub.add_parser('prepare')
    p.add_argument('--spec', required=True)
    p.add_argument('--out', required=True)
    p.add_argument('--existing-manifest')
    p = sub.add_parser('upload')
    p.add_argument('--plan', required=True)
    p.add_argument('--receipt', required=True)
    args = parser.parse_args()
    try:
        if args.command == 'prepare':
            existing = json.loads(Path(args.existing_manifest).read_text()) if args.existing_manifest else None
            prepare(json.loads(Path(args.spec).read_text()), args.out, existing)
        else:
            result = upload(json.loads(Path(args.plan).read_text()))
            Path(args.receipt).write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding='utf-8')
            emit(result)
    except (PublishError, ValueError, KeyError, OSError) as error:
        emit({'ok': False, 'error': str(error), 'resume': 'Reuse the same release ID and upload plan; never substitute artwork'})
        return 1
    return 0


if __name__ == '__main__':
    sys.exit(main())
