package sk.biotoken.android

import androidx.camera.core.CameraSelector
import androidx.camera.core.ImageAnalysis
import androidx.camera.core.Preview
import androidx.camera.lifecycle.ProcessCameraProvider
import androidx.camera.view.PreviewView
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.core.content.ContextCompat
import androidx.lifecycle.compose.LocalLifecycleOwner
import com.google.zxing.BarcodeFormat
import com.google.zxing.BinaryBitmap
import com.google.zxing.DecodeHintType
import com.google.zxing.MultiFormatReader
import com.google.zxing.PlanarYUVLuminanceSource
import com.google.zxing.common.HybridBinarizer
import java.util.concurrent.Executors
import java.util.concurrent.atomic.AtomicBoolean

/** CameraX + ZXing core run on-device. No Firebase, cloud scanner, storage or image upload. */
@Composable
fun QrScanner(onScanned: (String) -> Unit, onCancel: () -> Unit) {
    val context = LocalContext.current
    val owner = LocalLifecycleOwner.current
    val currentScanned = rememberUpdatedState(onScanned)
    val view = remember { PreviewView(context) }
    DisposableEffect(owner, view) {
        val done = AtomicBoolean(false)
        val disposed = AtomicBoolean(false)
        val executor = Executors.newSingleThreadExecutor()
        val future = ProcessCameraProvider.getInstance(context)
        var provider: ProcessCameraProvider? = null
        val reader = MultiFormatReader().apply {
            setHints(mapOf(DecodeHintType.POSSIBLE_FORMATS to listOf(BarcodeFormat.QR_CODE)))
        }
        val analysis = ImageAnalysis.Builder()
            .setBackpressureStrategy(ImageAnalysis.STRATEGY_KEEP_ONLY_LATEST).build()
        analysis.setAnalyzer(executor) { image ->
            try {
                if (!done.get() && !disposed.get()) {
                    val plane = image.planes[0]
                    val buffer = plane.buffer
                    val offset = buffer.position()
                    val luminance = ByteArray(image.width * image.height)
                    for (row in 0 until image.height) {
                        for (column in 0 until image.width) {
                            luminance[row * image.width + column] = buffer.get(offset + row * plane.rowStride + column * plane.pixelStride)
                        }
                    }
                    val source = PlanarYUVLuminanceSource(luminance, image.width, image.height, 0, 0, image.width, image.height, false)
                    val result = reader.decodeWithState(BinaryBitmap(HybridBinarizer(source)))
                    if (done.compareAndSet(false, true)) {
                        ContextCompat.getMainExecutor(context).execute {
                            if (!disposed.get()) currentScanned.value(result.text)
                        }
                    }
                }
            } catch (_: com.google.zxing.ReaderException) {
                // Most camera frames contain no decodable QR. Never log frame contents.
            } finally {
                reader.reset()
                image.close()
            }
        }
        future.addListener({
            if (!disposed.get()) {
                try {
                    provider = future.get()
                    val preview = Preview.Builder().build().apply { surfaceProvider = view.surfaceProvider }
                    provider?.bindToLifecycle(owner, CameraSelector.DEFAULT_BACK_CAMERA, preview, analysis)
                } catch (_: Exception) {
                    onCancel()
                }
            }
        }, ContextCompat.getMainExecutor(context))
        onDispose {
            disposed.set(true)
            analysis.clearAnalyzer()
            provider?.unbind(analysis)
            provider?.unbindAll()
            executor.shutdown()
        }
    }
    Column {
        Text("Naskenujte QR kód z dôveryhodnej služby na svojom PC.")
        AndroidView(factory = { view }, modifier = Modifier.fillMaxWidth().height(400.dp))
        OutlinedButton(onClick = onCancel) { Text("Zrušiť skenovanie") }
    }
}
