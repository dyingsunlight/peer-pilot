export const parallelTasks = async function (promises: (() => Promise<void>)[], max = 3) {
  await new Promise(resolve => {
    let jobQueuePointer = -1
    let ruiningJobs = 0

    const jobQueue = promises.map(job => {
      return async () => {
        if (typeof job === 'function') {
          await job()
        }
        ruiningJobs--
        updateJobQueue()
      }
    })

    const updateJobQueue = () => {
      const nextJob = jobQueue && jobQueue[jobQueuePointer + 1]

      if (!Boolean(nextJob) && ruiningJobs === 0) {
        if (resolve) {
          return resolve(undefined)
        }
        return
      }

      if (max > ruiningJobs && Boolean(nextJob)) {
        jobQueuePointer++
        ruiningJobs++
        jobQueue[jobQueuePointer]()
        updateJobQueue()
      }
    }

    updateJobQueue()
  })
}
