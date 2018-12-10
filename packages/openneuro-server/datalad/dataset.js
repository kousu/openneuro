/**
 * Implementation of dataset models internal to OpenNeuro's database
 *
 * See resolvers for interaction with other data sources.
 */
import request from 'superagent'
import requestNode from 'request'
import objectHash from 'object-hash'
import config from '../config'
import mongo from '../libs/mongo'
import * as subscriptions from '../handlers/subscriptions.js'
import { generateDataladCookie } from '../libs/authentication/jwt'
import { redis } from '../libs/redis.js'
import { updateDatasetRevision, draftPartialKey } from './draft.js'
import { createSnapshot } from './snapshots.js'
import { fileUrl } from './files.js'
import { getAccessionNumber } from '../libs/dataset.js'
import Dataset from '../models/dataset.js'
import Permission from '../models/permission.js'
import Star from '../models/stars.js'
import Analytics from '../models/analytics.js'
import { datasetsConnection } from './pagination.js'
const c = mongo.collections
const uri = config.datalad.uri

/**
 * Create a new dataset
 *
 * Internally we setup metadata and access
 * then create a new DataLad repo
 *
 * @param {string} uploader Id for user creating this dataset
 * @param {Object} userInfo User metadata
 * @returns {Promise} Resolves to {id: accessionNumber} for the new dataset
 */
export const createDataset = async (uploader, userInfo) => {
  // Obtain an accession number
  const datasetId = await getAccessionNumber()
  try {
    const ds = new Dataset({ id: datasetId, uploader })
    await request
      .post(`${uri}/datasets/${datasetId}`)
      .set('Accept', 'application/json')
      .set('Cookie', generateDataladCookie(config)(userInfo))
    // Write the new dataset to mongo after creation
    await ds.save()
    await giveUploaderPermission(datasetId, uploader)
    await subscriptions.subscribe(datasetId, uploader)
    return ds
  } catch (e) {
    // eslint-disable-next-line
    console.error(`Failed to create ${datasetId}`)
    throw e
  }
}

export const giveUploaderPermission = (datasetId, userId) => {
  const permission = new Permission({ datasetId, userId, level: 'admin' })
  return permission.save()
}

/**
 * Fetch dataset document and related fields
 */
export const getDataset = id => {
  return c.crn.datasets.findOne({ id })
}

/**
 * Delete dataset and associated documents
 */
export const deleteDataset = id => {
  let deleteURI = `${uri}/datasets/${id}`
  return new Promise((resolve, reject) => {
    request.del(deleteURI).then(() => {
      c.crn.datasets
        .deleteOne({ id })
        .then(() => resolve())
        .catch(err => reject(err))
    })
  })
}

/**
 * For public datasets, cache combinations of sorts/limits/cursors to speed responses
 * @param {object} options getDatasets options object
 */
export const getPublicDatasets = options => {
  const redisKey = `openneuro:publicDatasetsConnection:${objectHash(options)}`
  const expirationTime = 60
  return redis.get(redisKey).then(data => {
    if (data) {
      return JSON.parse(data)
    } else {
      return datasetsConnection([{ $match: { public: true } }], options).then(
        connection => {
          redis.setex(redisKey, expirationTime, JSON.stringify(connection))
          return connection
        },
      )
    }
  })
}

/**
 * Fetch all datasets
 * @param {object} options {public: true, admin: false, orderBy: {created: 'ascending'}}
 */
export const getDatasets = options => {
  if (options && 'public' in options && options.public) {
    // If only public datasets are requested, immediately return them
    return getPublicDatasets(options)
  } else if (options && 'admin' in options && options.admin) {
    // Admins can see all datasets
    return datasetsConnection([], options)
  } else if (options && 'userId' in options) {
    return c.crn.permissions
      .find({ userId: options.userId })
      .toArray()
      .then(datasetsAllowed => {
        const datasetIds = datasetsAllowed.map(
          permission => permission.datasetId,
        )
        return datasetsConnection(
          [{$match: {$or: [{ id: { $in: datasetIds } }, { public: true }]}}],
          options,
        )
      })
  } else {
    // If no permissions, anonymous requests always get public datasets
    return getPublicDatasets(options)
  }
}

// Files to skip in uploads
const blacklist = ['.DS_Store', 'Icon\r', '.git', '.gitattributes', '.datalad']

/**
 * Add files to a dataset
 */
export const addFile = (datasetId, path, file) => {
  // Cannot use superagent 'request' due to inability to post streams
  return new Promise((resolve, reject) =>
    file
      .then(({ filename, stream, mimetype }) => {
        // Skip any blacklisted files
        if (blacklist.includes(filename)) {
          return resolve()
        }
        stream
          .on('error', err => {
            if (err.constructor.name === 'FileStreamDisconnectUploadError') {
              // Catch client disconnects.
              // eslint-disable-next-line no-console
              console.warn(
                `Client disconnected during upload for dataset "${datasetId}".`,
              )
            } else {
              // Unknown error, log it at least.
              // eslint-disable-next-line no-console
              console.error(err)
            }
          })
          .pipe(
            requestNode(
              {
                url: fileUrl(datasetId, path, filename),
                method: 'post',
                headers: { 'Content-Type': mimetype },
              },
              err => (err ? reject(err) : resolve()),
            ),
          )
      })
      .catch(err => {
        if (err.constructor.name === 'UploadPromiseDisconnectUploadError') {
          // Catch client aborts silently
        } else {
          // Raise other errors
          throw err
        }
      }),
  ).finally(() => {
    return redis.del(draftPartialKey(datasetId))
  })
}

/**
 * Update an existing file in a dataset
 */
export const updateFile = (datasetId, path, file) => {
  // Cannot use superagent 'request' due to inability to post streams
  return new Promise(async (resolve, reject) => {
    const { filename, stream, mimetype } = await file
    stream
      .pipe(
        requestNode(
          {
            url: fileUrl(datasetId, path, filename),
            method: 'put',
            headers: { 'Content-Type': mimetype },
          },
          err => (err ? reject(err) : resolve()),
        ),
      )
      .on('error', err => reject(err))
  }).finally(() => {
    return redis.del(draftPartialKey(datasetId))
  })
}

/**
 * Commit a draft
 */
export const commitFiles = (datasetId, user) => {
  const url = `${uri}/datasets/${datasetId}/draft`
  const req = request
    .post(url)
    .set('Cookie', generateDataladCookie(config)(user))
    .set('Accept', 'application/json')
    .then(res => {
      return res.body.ref
    })
    .then(updateDatasetRevision(datasetId))
    .then(() =>
      // Check if this is the first data commit and no snapshots exist
      c.crn.snapshots.findOne({ datasetId }).then(snapshot => {
        if (!snapshot) {
          return createSnapshot(datasetId, '1.0.0', user)
        }
      }),
    )
  return req
}

/**
 * Delete an existing file in a dataset
 */
export const deleteFile = (datasetId, path, file) => {
  // Cannot use superagent 'request' due to inability to post streams
  let url = fileUrl(datasetId, path, file.name)
  return request.del(url)
}

/**
 * Update public state
 */
export const updatePublic = (datasetId, publicFlag) => {
  // update mongo
  return c.crn.datasets.updateOne(
    { id: datasetId },
    { $set: { public: publicFlag } },
    { upsert: true },
  )
}

export const getDatasetAnalytics = (datasetId, tag) => {
  let datasetQuery = tag
    ? { datasetId: datasetId, tag: tag }
    : { datasetId: datasetId }
  return Analytics.aggregate([
    {
      $match: datasetQuery,
    },
    {
      $group: {
        _id: '$datasetId',
        tag: { $first: '$tag' },
        views: {
          $sum: '$views',
        },
        downloads: {
          $sum: '$downloads',
        },
      },
    },
    {
      $project: {
        _id: 0,
        datasetId: '$_id',
        tag: 1,
        views: 1,
        downloads: 1,
      },
    },
  ]).then(results => {
    results = results.length ? results[0] : {}
    return results
  })
}

export const trackAnalytics = (datasetId, tag, type) => {
  return c.crn.analytics.updateOne(
    {
      datasetId: datasetId,
      tag: tag,
    },
    {
      $inc: {
        [type]: 1,
      },
    },
    {
      upsert: true,
    },
  )
}

export const getStars = datasetId => Star.find({ datasetId })

export const getFollowers = datasetId => {
  return c.crn.subscriptions
    .find({
      datasetId: datasetId,
    })
    .toArray()
}
