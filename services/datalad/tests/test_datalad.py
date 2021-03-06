"""Test DataLad Celery tasks."""
import os
from mock import patch

from .dataset_fixtures import *
from datalad_service.tasks.dataset import *
from datalad_service.tasks.files import commit_files


def test_create_dataset(annex_path):
    ds_id = 'ds000002'
    create_dataset.run(annex_path, ds_id)
    assert Dataset(os.path.join(annex_path, ds_id)).repo is not None


def test_delete_dataset(annex_path, new_dataset):
    ds_id = os.path.basename(new_dataset.path)
    delete_dataset.run(annex_path, ds_id)
    assert not os.path.exists(new_dataset.path)


def test_commit_file(celery_app, annex_path, new_dataset):
    ds_id = os.path.basename(new_dataset.path)
    # Write some files into the dataset first
    file_path = os.path.join(new_dataset.path, 'LICENSE')
    with open(file_path, 'w') as fd:
        fd.write("""GPL""")
    commit_files.run(annex_path, ds_id, ['LICENSE'])
    dataset = Dataset(os.path.join(annex_path, ds_id))
    assert not dataset.repo.dirty
