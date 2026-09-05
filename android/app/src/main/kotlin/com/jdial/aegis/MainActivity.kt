package com.jdial.aegis

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.text.BasicText
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.TextStyle

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        enableEdgeToEdge()
        super.onCreate(savedInstanceState)
        setContent { AegisApp() }
    }
}

@Composable
private fun AegisApp() {
    Box(
        modifier = Modifier.fillMaxSize().background(Color(0xFF05070F)),
        contentAlignment = Alignment.Center,
    ) {
        BasicText("Aegis", style = TextStyle(color = Color(0xFFE8C879)))
    }
}
