self.exports = {};
importScripts('/vision/vision_bundle.js');
const { FilesetResolver, PoseLandmarker } = self.exports;
let model;
self.onmessage = async ({ data }) => {
  if (data.type === 'init') {
    try {
      const files = await FilesetResolver.forVisionTasks('/wasm');
      model = await PoseLandmarker.createFromOptions(files, {
        baseOptions: { modelAssetPath: '/models/pose_landmarker_lite.task', delegate: 'CPU' },
        runningMode: 'VIDEO',
        numPoses: 2,
        minPoseDetectionConfidence: 0.65,
        minPosePresenceConfidence: 0.65,
        minTrackingConfidence: 0.65,
      });
      self.postMessage({ type: 'ready' });
    } catch (error) {
      console.error('Pose worker initialization:', error?.message);
      self.postMessage({
        type: 'error',
        message: 'The pose model could not load. Check your connection and retry.',
      });
    }
  }
  if (data.type === 'frame') {
    try {
      if (!model) return;
      const result = model.detectForVideo(data.bitmap, data.timestamp);
      self.postMessage({
        type: 'result',
        poses: result.landmarks,
        timestamp: data.timestamp,
        width: data.width,
        height: data.height,
      });
    } catch {
      self.postMessage({
        type: 'error',
        message: 'Camera analysis failed. Stop and retry tracking.',
      });
    } finally {
      data.bitmap?.close();
    }
  }
};
