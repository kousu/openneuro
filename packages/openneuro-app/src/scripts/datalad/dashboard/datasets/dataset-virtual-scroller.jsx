import React from 'react'
import PropTypes from 'prop-types'
import {
  InfiniteLoader,
  List,
  AutoSizer,
  WindowScroller,
} from 'react-virtualized'
import DatasetRow from './dataset-row.jsx'
import styled from '@emotion/styled'

let datasetVirtualList = []

const isRowLoaded = ({ index }) => !!datasetVirtualList[index]

const rowRenderer = ({ key, index, style }) => {
  if (index < datasetVirtualList.length) {
    return (
      <div key={key} style={style}>
        <DatasetRow dataset={datasetVirtualList[index].node} />
      </div>
    )
  } else {
    return (
      <div key={key} style={style}>
        Loading datasets...
      </div>
    )
  }
}

const FlexParent = styled.div`
  display: flex;
  flex-flow: column;
  height: 100%;
  flex: 1 1 auto;
`

const FlexFullHeight = styled.div`
  flex: 1 1 auto;
  white-space: nowrap;
`

const DatasetVirtualScroller = ({ datasets, pageInfo, loadMoreRows }) => {
  datasetVirtualList = datasets
  return (
    <FlexParent>
      <FlexFullHeight>
        <InfiniteLoader
          isRowLoaded={isRowLoaded}
          loadMoreRows={loadMoreRows}
          rowCount={pageInfo.count}>
          {({ onRowsRendered, registerChild }) => (
            <WindowScroller>
              {({ height, scrollTop }) => (
                <AutoSizer disableHeight>
                  {({ width }) => (
                    <List
                      autoHeight
                      height={height}
                      onRowsRendered={onRowsRendered}
                      ref={registerChild}
                      rowCount={pageInfo.count}
                      rowHeight={94}
                      rowRenderer={rowRenderer}
                      width={width}
                      scrollTop={scrollTop}
                    />
                  )}
                </AutoSizer>
              )}
            </WindowScroller>
          )}
        </InfiniteLoader>
      </FlexFullHeight>
    </FlexParent>
  )
}

DatasetVirtualScroller.propTypes = {
  datasets: PropTypes.array,
  pageInfo: PropTypes.object,
  loadMoreRows: PropTypes.func,
}

export default DatasetVirtualScroller
