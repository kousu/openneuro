/* eslint-disable no-console */
import React from 'react'
import PropTypes from 'prop-types'
import WarnButton from '../../common/forms/warn-button.jsx'
import config from '../../../../config.js'

const startDownload = (uri, datasetId) => {
  global.open(uri, `${datasetId} download`)
}

/**
 * Event handler for initiating dataset or snapshot downloads
 * @param {string} datasetId Accession number string for a dataset
 */
const downloadClick = (datasetId, snapshotTag) => callback => {
  // This can't be a GraphQL query since it is intercepted
  // by the service worker
  const uri = snapshotTag
    ? `${config.crn.url}datasets/${datasetId}/snapshots/${snapshotTag}/download`
    : `${config.crn.url}datasets/${datasetId}/download`
  // Check that a service worker is registered
  if (!global.navigator.serviceWorker) {
    global.alert(
      'Your browser is out of date, please upgrade to a newer supported browser to download.',
    )
    callback()
  } else if (typeof global.ReadableStream === 'undefined') {
    // This is likely Firefox with flags disabled
    global.alert(
      'Web streams are required to download. Try a recent version of Chrome or enable "dom.streams.enabled",  "javascript.options.streams", and "dom.ipc.multiOptOut" in Firefox about:config',
    )
    callback()
  } else {
    // Check for a running service worker
    global.navigator.serviceWorker.getRegistration().then(registration => {
      if (registration.active) {
        // Service worker is already running as expected
        startDownload(uri, datasetId)
        callback()
      } else {
        // Waiting on the service worker
        if (registration.installing || registration.waiting) {
          serviceWorker.addEventListener('statechange', function(e) {
            if (e.target.state === 'active') {
              // Worker ready, start downloading
              serviceWorker.removeEventListener('statechange', this, true)
              startDownload(uri, datasetId)
              callback()
            }
          })
        } else {
          global.alert(
            'Download failed, please refresh and try again in a few moments.',
          )
          callback()
        }
      }
    })
  }
}

/**
 * Generate a magic bundle link for this dataset
 */
const DownloadLink = ({ datasetId, snapshotTag }) => (
  <div role="presentation" className="tool">
    <WarnButton
      tooltip="Download"
      icon="fa-download"
      warn={false}
      action={downloadClick(datasetId, snapshotTag)}
    />
  </div>
)

DownloadLink.propTypes = {
  datasetId: PropTypes.string.isRequired,
  snapshotTag: PropTypes.string,
}

export default DownloadLink
