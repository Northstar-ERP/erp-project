import logging
from django.conf import settings
from django.core.mail import send_mail
from django.core.signing import BadSignature, SignatureExpired, TimestampSigner
from rest_framework.exceptions import ValidationError
from .models import Employee, User

logger = logging.getLogger(__name__)

SIGNER_SALT = 'northstar-employee-account-activation'
INVITATION_EXPIRATION_SECONDS = 86400  # 24 hours


def generate_activation_token(user: User) -> str:
    """Generate a tamper-proof, time-stamped token for account activation."""
    signer = TimestampSigner(salt=SIGNER_SALT)
    payload = str(user.public_id)
    return signer.sign(payload)


def verify_activation_token(token: str, max_age: int = INVITATION_EXPIRATION_SECONDS):
    """
    Validate an activation token, ensuring it is unexpired, authentic, and single-use.
    Returns (user, employee).
    """
    if not token or not isinstance(token, str):
        raise ValidationError({'token': 'An activation token is required.'})

    signer = TimestampSigner(salt=SIGNER_SALT)
    try:
        user_public_id = signer.unsign(token, max_age=max_age)
    except SignatureExpired:
        raise ValidationError({'token': 'This activation link has expired. Please contact HR to resend an invitation.'})
    except BadSignature:
        raise ValidationError({'token': 'The activation link is invalid or malformed.'})

    try:
        user = User.objects.select_related('role').get(public_id=user_public_id, is_deleted=False)
    except User.DoesNotExist:
        raise ValidationError({'token': 'Associated user account was not found or has been removed.'})

    if user.is_active:
        raise ValidationError({'token': 'This account has already been activated. You can sign in directly.'})

    try:
        employee = Employee.objects.select_related('department').get(user=user, is_deleted=False)
    except Employee.DoesNotExist:
        employee = None

    return user, employee


def send_invitation_email(employee: Employee, user: User) -> str:
    """
    Generate an activation token, compose the invitation email, and dispatch it
    to the employee's official email address.
    """
    token = generate_activation_token(user)
    base_url = getattr(settings, 'FRONTEND_URL', 'http://localhost:5173').rstrip('/')
    recipient_email = employee.email or user.email

    employee_full_name = f"{employee.first_name} {employee.last_name}".strip()
    activation_url = (
        f"{base_url}/activate?token={token}&email={recipient_email}&name={employee.first_name}+{employee.last_name}"
    )

    subject = "Welcome to Northstar ERP – Activate Your Employee Account"

    message = f"""Hello {employee_full_name},

Welcome to Northstar ERP!

Your employee account has been created by your HR department.

Please click the secure activation link below to activate your account and create your password:

{activation_url}

This link is valid for a limited time (24 hours) and can only be used once.

Regards,
HR Team
Northstar ERP
"""

    html_message = f"""<!DOCTYPE html>
<html>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; line-height: 1.6; color: #1e293b; max-width: 600px; margin: 0 auto; padding: 24px;">
  <div style="background-color: #0f172a; padding: 24px; border-radius: 12px; text-align: center; margin-bottom: 24px;">
    <h1 style="color: #ffffff; margin: 0; font-size: 20px; letter-spacing: 1.5px; text-transform: uppercase;">NORTHSTAR ERP</h1>
    <p style="color: #60a5fa; margin: 4px 0 0 0; font-size: 12px; font-weight: 600;">PLAN &bull; MANAGE &bull; GROW</p>
  </div>

  <h2 style="font-size: 18px; color: #0f172a; margin-top: 0;">Welcome to Northstar ERP!</h2>
  <p>Hello <strong>{employee_full_name}</strong>,</p>
  <p>Your employee account has been created by your HR department. Please click the secure button below to activate your account and create your password.</p>

  <div style="text-align: center; margin: 32px 0;">
    <a href="{activation_url}" style="background-color: #2563eb; color: #ffffff; padding: 12px 28px; border-radius: 8px; text-decoration: none; font-weight: 600; font-size: 14px; display: inline-block;">Activate My Account</a>
  </div>

  <p style="font-size: 12px; color: #64748b;">If the button does not work, copy and paste this link into your browser:<br>
    <a href="{activation_url}" style="color: #2563eb; word-break: break-all;">{activation_url}</a>
  </p>

  <p style="font-size: 12px; color: #94a3b8; border-top: 1px solid #e2e8f0; padding-top: 16px; margin-top: 32px;">
    This link is valid for 24 hours and can only be used once.<br>
    Regards,<br>
    <strong>HR Team &bull; Northstar ERP</strong>
  </p>
</body>
</html>"""

    from_email = getattr(settings, 'DEFAULT_FROM_EMAIL', 'Northstar ERP <noreply@northstar-erp.example>')

    logger.info("Dispatching activation email to %s for user %s", recipient_email, user.username)
    send_mail(
        subject=subject,
        message=message,
        from_email=from_email,
        recipient_list=[recipient_email],
        html_message=html_message,
        fail_silently=False,
    )

    return activation_url

