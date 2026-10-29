import importlib.util
import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('publisher', Path(__file__).parents[1] / 'scripts/publish-comic.py')
publisher = importlib.util.module_from_spec(spec)
spec.loader.exec_module(publisher)


class PublisherClientTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.image = self.root / 'original-wrong-extension.png'
        self.image.write_bytes(b'\xff\xd8\xff' + b'original-jpeg-bytes')
        self.passport = {'comic_id': 'royal-gambler', 'channel_id': 'ch-royal-gambler'}
        self.spec = {**self.passport, 'type': 'COVER', 'episode': 0, 'title': 'Approved cover', 'cover': str(self.image), 'pages': [], 'owner_approved': True, 'canon_state': 'CANON_FINAL', 'qc': 'QC_PASS', 'approval_reference': 'Owner approved this original cover', 'reason': 'Publish the approved original cover'}

    def prepare(self):
        with patch.object(publisher, 'request', return_value=self.passport):
            return publisher.prepare(self.spec, self.root / 'release')

    def test_signature_not_filename_and_no_recompression(self):
        plan = self.prepare()
        self.assertEqual(plan['manifest']['cover']['content_type'], 'image/jpeg')
        self.assertEqual(plan['manifest']['cover']['size'], self.image.stat().st_size)
        self.assertEqual(plan['manifest']['page_count'], 0)
        self.assertEqual(self.image.read_bytes(), b'\xff\xd8\xff' + b'original-jpeg-bytes')

    def test_missing_approval_and_wrong_channel(self):
        for field, value in [('owner_approved', False), ('channel_id', 'ch-legendary-decks')]:
            spec = {**self.spec, field: value}
            with patch.object(publisher, 'request', return_value=self.passport):
                with self.assertRaises(publisher.PublishError):
                    publisher.prepare(spec, self.root / 'rejected')
        self.assertFalse((self.root / 'rejected').exists())

    def test_changed_source_rejected_before_remote_write(self):
        plan = self.prepare()
        self.image.write_bytes(b'\xff\xd8\xffchanged')
        with patch.object(publisher, 'request', return_value=self.passport) as remote:
            with self.assertRaises(publisher.PublishError):
                publisher.upload(plan)
        self.assertEqual(remote.call_count, 1)

    def test_direct_upload_receipt_public_hash_and_repeat(self):
        plan = self.prepare()
        manifest = plan['manifest']
        descriptor = manifest['cover']
        url = publisher.asset_url(manifest, 0)
        receipt = {**{k: manifest[k] for k in ('id', 'comic_id', 'channel_id', 'episode', 'title', 'page_count')}, 'status': 'PUBLISHED', 'assets': [{**descriptor, 'kind': 'COVER', 'url': url}]}
        calls = []
        published = False
        def remote(path, body=None, headers=None, raw=False):
            nonlocal published
            calls.append((path, body, headers))
            if '/passports/' in path:
                return self.passport
            if '/releases/' in path:
                return receipt if published else {**receipt, 'status': 'AWAITING_UPLOAD', 'assets': [descriptor]}
            if '/uploads/' in path:
                self.assertEqual(body, self.image.read_bytes())
                self.assertEqual(headers['X-AM-Comic-ID'], 'royal-gambler')
                return {'staged': True, 'sha256': descriptor['sha256']}
            if '/process/' in path:
                published = True
                return receipt
            if '/media/' in path:
                return self.image.read_bytes()
            if path == '/catalog.json':
                return {'series': [{'id': 'royal-gambler', 'cover': {'asset': url[len(publisher.ORIGIN):]}}]}
            raise AssertionError(path)
        with patch.object(publisher, 'request', side_effect=remote):
            self.assertEqual(publisher.upload(plan)['status'], 'PUBLISHED_AND_VERIFIED')
            writes = len([c for c in calls if c[1] is not None])
            self.assertEqual(publisher.upload(plan)['status'], 'PUBLISHED_AND_VERIFIED')
            self.assertEqual(len([c for c in calls if c[1] is not None]), writes)
            with patch.object(publisher, 'request', side_effect=lambda path, **kw: b'wrong' if '/media/' in path else remote(path, **kw)):
                with self.assertRaises(publisher.PublishError):
                    publisher.verify_receipt(receipt, manifest)


if __name__ == '__main__':
    unittest.main()
