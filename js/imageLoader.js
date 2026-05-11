export function setupImageLoader({ dropzone, fileInput, onImageLoaded }) {
  const loadFile = (file) => {
    if (!file || !file.type.startsWith('image/')) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => onImageLoaded(img);
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  };

  fileInput.addEventListener('change', (e) => {
    if (e.target.files && e.target.files[0]) loadFile(e.target.files[0]);
  });

  const preventDefaults = (e) => {
    e.preventDefault();
    e.stopPropagation();
  };

  ['dragenter', 'dragover', 'dragleave', 'drop'].forEach((evt) => {
    dropzone.addEventListener(evt, preventDefaults);
    document.body.addEventListener(evt, preventDefaults);
  });

  ['dragenter', 'dragover'].forEach((evt) => {
    dropzone.addEventListener(evt, () => dropzone.classList.add('dragging'));
  });

  ['dragleave', 'drop'].forEach((evt) => {
    dropzone.addEventListener(evt, () => dropzone.classList.remove('dragging'));
  });

  dropzone.addEventListener('drop', (e) => {
    const file = e.dataTransfer.files[0];
    loadFile(file);
  });
}
