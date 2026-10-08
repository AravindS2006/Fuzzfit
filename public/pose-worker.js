self.exports = {};
importScripts('/vision/vision_bundle.js');
const { FilesetResolver, PoseLandmarker } = self.exports;
let model;
let variant = 'full';
let delegate = 'CPU';
self.onmessage = async ({ data }) => {
  if (data.type === 'init') {
    try {
      const files = await FilesetResolver.forVisionTasks('/wasm');
      variant = ['lite', 'full', 'heavy'].includes(data.variant) ? data.variant : 'full';
      const options = {
        baseOptions: { modelAssetPath: `/models/pose_landmarker_${variant}.task`, delegate: 'CPU' },
        runningMode: 'VIDEO',
        // One camera represents one trainee. This enables MediaPipe's native
        // temporal smoothing and avoids running its body detector on every frame.
        numPoses: 1,
        minPoseDetectionConfidence: 0.5,
        minPosePresenceConfidence: 0.5,
        minTrackingConfidence: 0.5,
      };
      if (typeof OffscreenCanvas !== 'undefined') {
        try {
          model = await PoseLandmarker.createFromOptions(files, {
            ...options,
            canvas: new OffscreenCanvas(256, 256),
            baseOptions: { ...options.baseOptions, delegate: 'GPU' },
          });
          delegate = 'GPU';
        } catch {
          model = await PoseLandmarker.createFromOptions(files, options);
          delegate = 'CPU';
        }
      } else {
        model = await PoseLandmarker.createFromOptions(files, options);
        delegate = 'CPU';
      }
      self.postMessage({ type: 'ready', variant, delegate });
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
      const started = performance.now();
      const result = model.detectForVideo(data.bitmap, data.timestamp);
      self.postMessage({
        type: 'result',
        poses: result.landmarks,
        worldPoses: result.worldLandmarks,
        inferenceMs: performance.now() - started,
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
