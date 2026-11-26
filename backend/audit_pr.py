import os
import sys
import ast
import django
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent
APPS_DIR = BASE_DIR / "apps"
sys.path.insert(0, str(BASE_DIR))
sys.path.insert(0, str(APPS_DIR))

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "core.settings")
django.setup()

from django.apps import apps
from django.db import models

TARGET_APPS = ["users", "organization", "projects", "assets", "leave", "expense"]

errors = []
warnings = []
repeated_code = []

print("=" * 72)
print("🚀 RUNNING FULL ERP AUDIT (Models, N+1, Atomic, Serializers & DRY Utils)")
print("=" * 72)

# 1. CHECK MODELS: public_id, is_deleted, created_by
print("\n🔍 [1/4] Auditing Models (public_id, is_deleted, created_by)...")
model_fk_map = {}

for app_label in TARGET_APPS:
    try:
        app_config = apps.get_app_config(app_label)
    except LookupError:
        warnings.append(f"[UNMERGED] App '{app_label}' is not in INSTALLED_APPS yet.")
        continue

    for model in app_config.get_models():
        model_name = f"{app_label}.{model.__name__}"
        fields = model._meta.get_fields()
        field_names = [f.name for f in fields]

        # Collect ForeignKey / OneToOne / ManyToMany fields for smart N+1 checking
        rel_fields = [
            f.name for f in fields
            if isinstance(f, (models.ForeignKey, models.OneToOneField, models.ManyToManyField))
        ]
        model_fk_map[model.__name__.lower()] = rel_fields

        if model.__name__ == "User":
            continue

        if "public_id" not in field_names:
            errors.append(f"[MODEL] {model_name} is missing 'public_id' (UUID).")
        if "is_deleted" not in field_names:
            errors.append(f"[MODEL] {model_name} is missing 'is_deleted' (Soft Delete).")
        if "created_by" not in field_names:
            errors.append(f"[MODEL] {model_name} is missing 'created_by' field.")

# 2. AST SCANNER FOR VIEWS: N+1 Queries, Atomic Transactions, lookup_field
print("🔍 [2/4] Auditing Views (Strict N+1 Queries & Atomic Transactions)...")
for app_label in TARGET_APPS:
    views_path = APPS_DIR / app_label / "views.py"
    if not views_path.exists():
        continue

    source = views_path.read_text(encoding="utf-8")
    tree = ast.parse(source, filename=str(views_path))

    for node in ast.walk(tree):
        if isinstance(node, ast.ClassDef):
            class_code = ast.get_source_segment(source, node) or ""
            base_names = [getattr(b, "id", getattr(b, "attr", "")) for b in node.bases]
            is_viewset = any("ViewSet" in b for b in base_names)

            if is_viewset:
                # Check lookup_field
                if "lookup_field" not in class_code and "Audit" not in "".join(base_names):
                    errors.append(
                        f"[ROUTING] {app_label}.views.{node.name}: Missing `lookup_field = 'public_id'` (or inherit AuditModelViewSet)."
                    )

                # Strict N+1 check
                guessed_model = node.name.replace("ViewSet", "").lower()
                fks = model_fk_map.get(guessed_model, [])
                if fks and "select_related" not in class_code and "prefetch_related" not in class_code:
                    errors.append(
                        f"[N+1 QUERY] {app_label}.views.{node.name}: Missing `select_related` / `prefetch_related` for relational fields {fks}."
                    )

            # Check methods for state modifications without @transaction.atomic
            for item in node.body:
                if isinstance(item, ast.FunctionDef):
                    method_code = ast.get_source_segment(source, item) or ""
                    writes_count = (
                        method_code.count(".save(")
                        + method_code.count(".create(")
                        + method_code.count(".update(")
                    )
                    is_workflow_action = any(
                        k in item.name
                        for k in ["approve", "reject", "allocate", "return", "cancel", "change_status", "perform_create", "perform_update", "perform_destroy"]
                    )
                    if (writes_count > 0 or is_workflow_action) and "atomic" not in method_code and "atomic" not in class_code:
                        errors.append(
                            f"[ATOMICITY] {app_label}.views.{node.name}.{item.name}(): Modifies DB state without `@transaction.atomic`."
                        )

# 3. SERIALIZER AUDIT
print("🔍 [3/4] Auditing Serializers (UUID Lookups & Field Exposure)...")
for app_label in TARGET_APPS:
    ser_path = APPS_DIR / app_label / "serializers.py"
    if not ser_path.exists():
        continue

    source = ser_path.read_text(encoding="utf-8")
    if "'__all__'" in source or '"__all__"' in source:
        errors.append(
            f"[SERIALIZER] {app_label}/serializers.py uses `fields = '__all__'`, leaking internal `id` and `is_deleted`!"
        )

# 4. REPEATED CODE (DRY) AUDIT: Check what should be moved to apps/utils
print("🔍 [4/4] Auditing for Repeated Code (Should use apps/utils)...")
for app_label in TARGET_APPS:
    app_dir = APPS_DIR / app_label
    if not app_dir.exists():
        continue

    models_file = app_dir / "models.py"
    if models_file.exists():
        m_src = models_file.read_text(encoding="utf-8")
        if "models.UUIDField" in m_src and "AuditBaseModel" not in m_src:
            repeated_code.append(f"[DRY-MODELS] apps/{app_label}/models.py manually defines `UUIDField` instead of inheriting `AuditBaseModel` from `apps.utils.models`.")
        if "is_deleted = models.BooleanField" in m_src:
            repeated_code.append(f"[DRY-MODELS] apps/{app_label}/models.py manually defines `is_deleted` instead of inheriting `AuditBaseModel` from `apps.utils.models`.")
        if "created_by = models.ForeignKey" in m_src:
            repeated_code.append(f"[DRY-MODELS] apps/{app_label}/models.py manually defines `created_by` instead of inheriting `AuditBaseModel` from `apps.utils.models`.")
        if "SoftDeleteManager" in m_src or "ActiveManager" in m_src:
            repeated_code.append(f"[DRY-MODELS] apps/{app_label}/models.py defines a custom SoftDelete manager instead of using `apps.utils.models`.")

    views_file = app_dir / "views.py"
    if views_file.exists():
        v_src = views_file.read_text(encoding="utf-8")
        if "lookup_field = 'public_id'" in v_src or 'lookup_field = "public_id"' in v_src:
            repeated_code.append(f"[DRY-VIEWS] apps/{app_label}/views.py repeats `lookup_field = 'public_id'` instead of inheriting `AuditModelViewSet` from `apps.utils.views`.")
        if "def perform_create" in v_src and "created_by" in v_src:
            repeated_code.append(f"[DRY-VIEWS] apps/{app_label}/views.py repeats `perform_create(created_by=...)` instead of using `AuditModelViewSet`.")
        if "def perform_destroy" in v_src and ("is_deleted" in v_src or ".delete()" in v_src):
            repeated_code.append(f"[DRY-VIEWS] apps/{app_label}/views.py repeats soft-delete `perform_destroy` instead of using `AuditModelViewSet`.")

    ser_file = app_dir / "serializers.py"
    if ser_file.exists():
        s_src = ser_file.read_text(encoding="utf-8")
        if "created_by_name" in s_src and "BaseAuditSerializer" not in s_src and "AuditModelSerializer" not in s_src:
            repeated_code.append(f"[DRY-SERIALIZERS] apps/{app_label}/serializers.py repeats `created_by_name` instead of inheriting `BaseAuditSerializer` from `apps.utils.serializers`.")

# REPORT RESULTS
print("\n" + "=" * 72)
if repeated_code:
    print(f"♻️  REPEATED CODE TO MOVE TO apps/utils ({len(repeated_code)}):")
    for r in repeated_code:
        print(f"  - {r}")

if warnings:
    print(f"\n⚠️  WARNINGS ({len(warnings)}):")
    for w in warnings:
        print(f"  - {w}")

if errors:
    print(f"\n❌ FAILED CHECKS ({len(errors)}):")
    for e in errors:
        print(f"  - {e}")
    print("=" * 72)
    sys.exit(1)
else:
    print("\n✅ ALL MANDATORY ARCHITECTURAL CHECKS PASSED!")
    print("=" * 72)
    sys.exit(0)