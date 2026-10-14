import smtplib
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
import logging
from datetime import datetime
from config import Config

logger = logging.getLogger(__name__)

def send_smtp_alert_email(recipient_email, subject, body_html):
    """
    Sends an alert email via configured SMTP server.
    Safely catches any network/authentication errors so app operations are never blocked.
    """
    if not Config.MAIL_USERNAME or not Config.MAIL_PASSWORD:
        logger.info("SMTP email credentials not set in environment. Skipping physical email dispatch.")
        return False, "SMTP credentials not configured."

    target_email = recipient_email or Config.ALERT_RECIPIENT_EMAIL
    if not target_email:
        logger.info("No recipient email specified for flood alert.")
        return False, "No recipient specified."

    try:
        msg = MIMEMultipart("alternative")
        msg["Subject"] = subject
        msg["From"] = Config.MAIL_DEFAULT_SENDER or Config.MAIL_USERNAME
        msg["To"] = target_email

        html_part = MIMEText(body_html, "html")
        msg.attach(html_part)

        server = smtplib.SMTP(Config.MAIL_SERVER, Config.MAIL_PORT, timeout=8)
        if Config.MAIL_USE_TLS:
            server.starttls()
        server.login(Config.MAIL_USERNAME, Config.MAIL_PASSWORD)
        server.sendmail(msg["From"], [target_email], msg.as_string())
        server.quit()

        logger.info(f"Flood emergency alert successfully dispatched to {target_email}")
        return True, "Alert email sent successfully."
    except Exception as e:
        logger.warning(f"Failed to dispatch alert email via SMTP: {e}")
        return False, f"SMTP Error: {str(e)}"

def format_alert_email_html(location, rainfall, probability, parameters, timestamp):
    """Generates an HTML warning email template."""
    return f"""
    <!DOCTYPE html>
    <html>
    <head>
        <style>
            body {{ font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f8fafc; margin: 0; padding: 20px; }}
            .container {{ max-width: 600px; margin: 0 auto; background: #ffffff; border-radius: 12px; overflow: hidden; border: 1px solid #fee2e2; box-shadow: 0 4px 15px rgba(239,68,68,0.1); }}
            .header {{ background-color: #dc2626; color: #ffffff; padding: 24px; text-align: center; }}
            .header h1 {{ margin: 0; font-size: 24px; text-transform: uppercase; letter-spacing: 1px; }}
            .content {{ padding: 24px; color: #1e293b; }}
            .badge {{ display: inline-block; background-color: #fef2f2; color: #b91c1c; padding: 6px 14px; border-radius: 999px; font-weight: bold; border: 1px solid #fecaca; }}
            .metric-table {{ width: 100%; border-collapse: collapse; margin: 20px 0; }}
            .metric-table td {{ padding: 10px; border-bottom: 1px solid #e2e8f0; }}
            .metric-table td:first-child {{ font-weight: 600; color: #64748b; }}
            .action-box {{ background: #fff1f2; border-left: 4px solid #e11d48; padding: 16px; margin: 20px 0; border-radius: 4px; }}
            .footer {{ background: #f1f5f9; padding: 16px; text-align: center; font-size: 12px; color: #64748b; }}
        </style>
    </head>
    <body>
        <div class="container">
            <div class="header">
                <h1>CRITICAL FLOOD WARNING</h1>
                <p style="margin: 5px 0 0; font-size: 14px; opacity: 0.9;">Urban Flood Prediction & Early Warning System</p>
            </div>
            <div class="content">
                <p><span class="badge">HIGH RISK DETECTED</span></p>
                <p>An automated meteorological evaluation has triggered a <strong>High Risk</strong> flood status for <strong>{location}</strong>.</p>
                
                <table class="metric-table">
                    <tr><td>Location</td><td><strong>{location}</strong></td></tr>
                    <tr><td>Assessed Risk Level</td><td><strong style="color: #dc2626;">High Risk ({probability:.1f}% Confidence)</strong></td></tr>
                    <tr><td>Precipitation (Rainfall)</td><td><strong>{rainfall} mm</strong></td></tr>
                    <tr><td>Relative Humidity</td><td>{parameters.get('humidity', 'N/A')}%</td></tr>
                    <tr><td>Atmospheric Pressure</td><td>{parameters.get('pressure', 'N/A')} hPa</td></tr>
                    <tr><td>Timestamp</td><td>{timestamp}</td></tr>
                </table>

                <div class="action-box">
                    <h3 style="margin-top: 0; color: #9f1239;">Immediate Safety Directives:</h3>
                    <ul style="padding-left: 20px; margin-bottom: 0;">
                        <li>Move to higher elevations immediately.</li>
                        <li>Do not cross flooded roads, bridges, or underpasses.</li>
                        <li>Disconnect main power panels if water levels rise.</li>
                        <li>Follow instructions from local disaster management authorities.</li>
                    </ul>
                </div>
            </div>
            <div class="footer">
                This is an automated early warning alert generated by the Urban Flood Prediction System.
            </div>
        </div>
    </body>
    </html>
    """

def process_flood_alert(prediction_dict, recipient_email=None):
    """
    Processes notification pipeline for flood predictions.
    If risk is High Risk, attempts email dispatch and records in-app notification state.
    """
    risk_level = prediction_dict.get("risk_level")
    if risk_level != "High Risk":
        return {
            "alert_triggered": False,
            "email_sent": False,
            "message": "Risk level within normal thresholds. No early warning needed."
        }

    location = prediction_dict.get("location_name", "Target Area")
    rainfall = prediction_dict.get("rainfall", 0.0)
    prob = prediction_dict.get("probability", 0.0)
    now_str = datetime.now().strftime("%Y-%m-%d %H:%M:%S")

    subject = f"CRITICAL FLOOD ALERT: High Risk Detected in {location}"
    html_content = format_alert_email_html(
        location=location,
        rainfall=rainfall,
        probability=prob,
        parameters=prediction_dict,
        timestamp=now_str
    )

    email_sent, email_msg = send_smtp_alert_email(recipient_email, subject, html_content)

    return {
        "alert_triggered": True,
        "email_sent": email_sent,
        "message": f"High risk emergency alert generated for {location}. {email_msg}"
    }
