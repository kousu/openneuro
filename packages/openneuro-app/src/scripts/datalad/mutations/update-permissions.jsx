import React from 'react'
import PropTypes from 'prop-types'
import gql from 'graphql-tag'
import { Mutation } from 'react-apollo'
import { PERMISSION_FRAGMENT } from '../dataset/dataset-query-fragments.js'
import { datasetCacheId } from './cache-id.js'

const UPDATE_PERMISSIONS = gql`
  mutation updatePermissions(
    $datasetId: ID!
    $userEmail: String!
    $level: String!
  ) {
    updatePermissions(
      datasetId: $datasetId
      userEmail: $userEmail
      level: $level
    ) {
      id
      email
    }
  }
`

export const mergeNewPermission = (
  datasetId,
  oldPermissions,
  userInfo,
  metadata,
) => {
  return {
    __typename: 'Dataset',
    id: datasetId,
    permissions: [
      ...oldPermissions,
      {
        __typename: 'Permission',
        user: { __typename: 'User', ...userInfo },
        level: metadata,
      },
    ],
  }
}

const UpdateDatasetPermissions = ({ datasetId, userEmail, metadata, done }) => (
  <Mutation
    mutation={UPDATE_PERMISSIONS}
    update={(cache, { data: { updatePermissions } }) => {
      const { permissions } = cache.readFragment({
        id: datasetCacheId(datasetId),
        fragment: PERMISSION_FRAGMENT,
      })
      cache.writeFragment({
        id: datasetCacheId(datasetId),
        fragment: PERMISSION_FRAGMENT,
        data: mergeNewPermission(
          datasetId,
          permissions,
          updatePermissions,
          metadata,
        ),
      })
    }}>
    {UpdateDatasetPermissions => (
      <button
        className="btn-modal-action"
        onClick={async () => {
          await UpdateDatasetPermissions({
            variables: { datasetId, userEmail, level: metadata },
          })
          done()
        }}>
        Share
      </button>
    )}
  </Mutation>
)

UpdateDatasetPermissions.propTypes = {
  datasetId: PropTypes.string,
  userEmail: PropTypes.string,
  metadata: PropTypes.oneOf(['ro', 'rw', 'admin']),
  done: PropTypes.func,
}

export default UpdateDatasetPermissions