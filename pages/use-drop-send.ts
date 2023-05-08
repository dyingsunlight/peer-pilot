import { onMounted } from "vue";

const createDropZoneContainer = () => {
  const dropZoneContainer = document.createElement('div')
  dropZoneContainer.setAttribute('style', `
    position: fixed;
    left:0;
    top:0;
    display: flex;
    justify-content: center;
    align-items: center;
    width:100%;
    height:100%;
    z-index: 2000;
    background-color:rgba(0,0,0,0.6);
  `)
  dropZoneContainer.setAttribute("class", "bg-slate-50")
  dropZoneContainer.innerHTML = `
<h3 style="color: white">
Drop file to send for everyone.
</h3>`
  return { dropZoneContainer }
}

export const useDropSend = (args: { handleSendFile: any }) => {
  const { handleSendFile } = args
  let isProcessing = false
  const handleDragEnter = (e: DragEvent) => {
    if (isProcessing) {
      return
    }
    isProcessing = true
    appendZoneContainer()
  }

  let dropZoneContainer: HTMLElement
  onMounted(() => {
    const zone = createDropZoneContainer()
    dropZoneContainer = zone.dropZoneContainer
    dropZoneContainer.addEventListener('dragenter', (event: DragEvent) => {
      event.preventDefault()
    })
    dropZoneContainer.addEventListener('dragover', (event: DragEvent) => {
      event.preventDefault()
    })
    dropZoneContainer.addEventListener('drop', (event: DragEvent) => {
      event.preventDefault()
      event.stopPropagation()
      isProcessing = false
      Array.from(event.dataTransfer?.items || []).forEach(async item => {
        const file = await item.getAsFile()
        if (file) {
          handleSendFile(file)
        }
      })
      removeZoneContainer()
    })
    dropZoneContainer.addEventListener('dragleave', event => {
      event.preventDefault()
      isProcessing = false
      removeZoneContainer()
    })
  })

  const appendZoneContainer = () => {
    document.body.appendChild(dropZoneContainer)
  }
  const removeZoneContainer = () => {
    dropZoneContainer.parentElement?.removeChild(dropZoneContainer)
  }

  return {
    handleDragEnter,
  }
}
