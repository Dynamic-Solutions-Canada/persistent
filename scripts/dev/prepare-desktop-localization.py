#!/usr/bin/env python3
"""Prepare only canonical translation catalogs for the narrow desktop source snapshot."""
import argparse
import hashlib
import json
from pathlib import Path
import tempfile


def prepare(repo):
    """Refresh generated build inputs atomically and verify bytes, without npm or unrelated repository data."""
    source = repo / 'packages/shared/src/messages'
    files = sorted(source.glob('*.json'))
    if not files or not (source / 'en-US.json').is_file():
        raise FileNotFoundError('Canonical English localization catalog is missing')
    contents = {}
    for path in files:
        data = path.read_bytes()
        catalog = json.loads(data)
        if not isinstance(catalog, dict) or not all(isinstance(value, str) for value in catalog.values()):
            raise ValueError('Invalid application catalog: ' + path.name)
        contents[path.name] = data

    output = repo / 'apps/desktop/build-inputs/localization'
    marker = output / '.generated-catalogs'
    if output.exists() and not marker.exists() and any(output.iterdir()):
        raise RuntimeError('Refusing to replace an unrecognized desktop build-input directory')
    output.mkdir(parents=True, exist_ok=True)
    marker.write_text('Generated from packages/shared/src/messages by prepare-desktop-localization.py.\n')
    hashes = []
    for name, data in contents.items():
        with tempfile.NamedTemporaryFile(dir=output, suffix='.tmp', delete=False) as temporary:
            temporary.write(data)
            staged = Path(temporary.name)
        staged.replace(output / name)
        if (output / name).read_bytes() != data or (source / name).read_bytes() != data:
            raise RuntimeError('Catalog changed while preparing desktop input: ' + name)
        hashes.append(hashlib.sha256(data).hexdigest() + '  ' + name)

    # Only this marked, generated directory is pruned. Nothing outside it is copied or removed.
    for stale in output.glob('*.json'):
        if stale.name not in contents:
            stale.unlink()
    (output / 'catalogs.sha256').write_text('\n'.join(hashes) + '\n')
    print(f'Prepared {len(contents)} desktop catalog inputs; SHA-256 verified against canonical sources.')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--repo', required=True, type=Path)
    prepare(parser.parse_args().repo.resolve())
