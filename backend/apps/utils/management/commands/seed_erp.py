import secrets
from datetime import date, timedelta
from pathlib import Path

from django.core.management.base import BaseCommand, CommandError
from django.db import connection, transaction
from django.utils import timezone

from apps.assets.models import Asset, AssetAllocation, AssetHistory
from apps.expense.models import Expense, ExpenseCategory
from apps.leave.models import LeaveBalance, LeavePolicy, LeaveRequest, LeaveType
from apps.organization.models import Branch, Company, Department, Team
from apps.projects.models import Project, Task
from apps.users.models import Employee, Role, User


class Command(BaseCommand):
    help = (
        "Replace seeded ERP data on an explicitly confirmed database with "
        "realistic development records."
    )

    def add_arguments(self, parser):
        parser.add_argument(
            "--confirm",
            action="store_true",
            help="Required to delete existing data and create seed accounts.",
        )
        parser.add_argument(
            "--expected-database",
            help="Required exact database name confirmation.",
        )
        parser.add_argument(
            "--expected-host",
            help="Required exact database host confirmation.",
        )

    @transaction.atomic
    def handle(self, **options):
        database_name = connection.settings_dict.get("NAME")
        database_host = connection.settings_dict.get("HOST")
        if not database_name or not database_host:
            raise CommandError(
                "The default database NAME and HOST must be configured before seeding."
            )
        if not options["confirm"]:
            raise CommandError(
                "No data was changed. Rerun with --confirm and the exact "
                "--expected-database and --expected-host values."
            )
        if options["expected_database"] != database_name:
            raise CommandError(
                "Database name confirmation does not match the configured database."
            )
        if options["expected_host"] != database_host:
            raise CommandError(
                "Database host confirmation does not match the configured database."
            )

        credentials_path = Path(__file__).resolve().parents[4] / "seed_credentials.txt"
        if credentials_path.exists():
            raise CommandError(
                f"{credentials_path} already exists. Preserve it securely or remove "
                "it deliberately before running this command again."
            )

        admin = User.all_objects.filter(username="erp_admin").first()
        if admin is not None and (not admin.is_superuser or admin.is_deleted):
            raise CommandError(
                'An existing "erp_admin" account is not an active superuser; '
                "refusing to modify it."
            )

        role_specs = (
            ("System Admin", "System administration and enterprise configuration."),
            ("HR Manager", "Human resources leadership and leave administration."),
            (
                "Department / Project Manager",
                "Department operations and project delivery.",
            ),
            ("Employee", "Standard employee access."),
        )
        roles = {}
        for role_name, description in role_specs:
            role = Role.all_objects.filter(role_name=role_name).first()
            if role and role.is_deleted:
                raise CommandError(
                    f'The existing role "{role_name}" is soft-deleted; '
                    "restore or rename it before seeding."
                )
            if role is None:
                role = Role.all_objects.create(
                    role_name=role_name,
                    description=description,
                    created_by=admin,
                )
            roles[role_name] = role

        accounts = []
        admin_created = admin is None
        if admin_created:
            admin_password = secrets.token_urlsafe(32)
            admin = User.objects.create_superuser(
                username="erp_admin",
                email="admin@northstar.example",
                password=admin_password,
                role=roles["System Admin"],
            )
            admin.created_by = admin
            admin.save(update_fields=["created_by", "updated_at"])
            accounts.append(
                {
                    "username": admin.username,
                    "password": admin_password,
                    "role": roles["System Admin"].role_name,
                    "email": admin.email,
                }
            )

        self.stdout.write(self.style.WARNING("Cleaning existing ERP records..."))
        self._clear_existing_data()

        today = date.today()
        now = timezone.now()
        company = Company.objects.create(
            name="Northstar Enterprise Group",
            registration_number="NSE-2026-001",
            address="One Northstar Plaza, Pune, Maharashtra, India",
            contact_email="contact@northstar.example",
            creation_reason="Primary enterprise seed organization.",
            created_by=admin,
        )
        branches = [
            Branch.objects.create(
                company=company,
                name="Pune Technology Campus",
                location="Hinjawadi Phase 2, Pune, Maharashtra, India",
                contact_phone="+91-20-5550-0100",
                creation_reason="Engineering and corporate operations hub.",
                created_by=admin,
            ),
            Branch.objects.create(
                company=company,
                name="Bengaluru Business Center",
                location="Outer Ring Road, Bengaluru, Karnataka, India",
                contact_phone="+91-80-5550-0200",
                creation_reason="Regional product and customer operations hub.",
                created_by=admin,
            ),
            Branch.objects.create(
                company=company,
                name="Mumbai Client Services Office",
                location="Bandra Kurla Complex, Mumbai, Maharashtra, India",
                contact_phone="+91-22-5550-0300",
                creation_reason="Client delivery and finance operations hub.",
                created_by=admin,
            ),
        ]

        departments = {
            "Engineering": Department.objects.create(
                branch=branches[0],
                name="Engineering",
                description="Enterprise application engineering and platform delivery.",
                created_by=admin,
            ),
            "People Operations": Department.objects.create(
                branch=branches[0],
                name="People Operations",
                description="Talent, employee experience, and workplace operations.",
                created_by=admin,
            ),
            "Finance": Department.objects.create(
                branch=branches[2],
                name="Finance",
                description="Financial planning, controls, and employee reimbursements.",
                created_by=admin,
            ),
            "Product": Department.objects.create(
                branch=branches[1],
                name="Product",
                description="Product strategy, research, and delivery.",
                created_by=admin,
            ),
        }
        Team.objects.create(
            department=departments["Engineering"],
            name="Platform Engineering",
            created_by=admin,
        )
        Team.objects.create(
            department=departments["Engineering"],
            name="Business Applications",
            created_by=admin,
        )
        Team.objects.create(
            department=departments["People Operations"],
            name="Talent and Workplace",
            created_by=admin,
        )
        Team.objects.create(
            department=departments["Finance"],
            name="Financial Operations",
            created_by=admin,
        )

        account_specs = (
            {
                "username": "manager",
                "email": "devika.rao@northstar.example",
                "first_name": "Devika",
                "last_name": "Rao",
                "job_title": "Engineering Manager",
                "department": departments["Engineering"],
                "role": roles["Department / Project Manager"],
                "phone": "+91-98765-41001",
            },
            {
                "username": "hr_manager",
                "email": "ananya.mehta@northstar.example",
                "first_name": "Ananya",
                "last_name": "Mehta",
                "job_title": "People Operations Manager",
                "department": departments["People Operations"],
                "role": roles["HR Manager"],
                "phone": "+91-98765-41002",
            },
            {
                "username": "employee",
                "email": "rohan.kulkarni@northstar.example",
                "first_name": "Rohan",
                "last_name": "Kulkarni",
                "job_title": "Senior Software Engineer",
                "department": departments["Engineering"],
                "role": roles["Employee"],
                "phone": "+91-98765-41003",
            },
            {
                "username": "employee2",
                "email": "isha.nair@northstar.example",
                "first_name": "Isha",
                "last_name": "Nair",
                "job_title": "Product Analyst",
                "department": departments["Product"],
                "role": roles["Employee"],
                "phone": "+91-98765-41004",
            },
            {
                "username": "finance_employee",
                "email": "kabir.shah@northstar.example",
                "first_name": "Kabir",
                "last_name": "Shah",
                "job_title": "Finance Analyst",
                "department": departments["Finance"],
                "role": roles["Employee"],
                "phone": "+91-98765-41005",
            },
        )
        employees = {}
        for spec in account_specs:
            password = secrets.token_urlsafe(32)
            user = User.objects.create_user(
                username=spec["username"],
                email=spec["email"],
                password=password,
                first_name=spec["first_name"],
                last_name=spec["last_name"],
                role=spec["role"],
                created_by=admin,
            )
            employee = Employee.objects.create(
                user=user,
                first_name=spec["first_name"],
                last_name=spec["last_name"],
                email=spec["email"],
                phone=spec["phone"],
                hire_date=today - timedelta(days=365 * 3),
                employment_status="Active",
                job_title=spec["job_title"],
                department=spec["department"],
                manager=None,
                created_by=admin,
            )
            accounts.append(
                {
                    "username": user.username,
                    "password": password,
                    "role": spec["role"].role_name,
                    "email": user.email,
                }
            )
            employees[spec["username"]] = employee

        manager = employees["manager"]
        for username, employee in employees.items():
            if username != "manager":
                employee.manager = manager
                employee.save(update_fields=["manager", "updated_at"])

        project_platform = Project.objects.create(
            name="Northstar Customer Platform Modernization",
            description=(
                "Modernize the customer platform with resilient services, "
                "measurable service levels, and a refreshed user experience."
            ),
            manager=manager,
            start_date=today - timedelta(days=45),
            end_date=today + timedelta(days=135),
            status=Project.Status.ACTIVE,
            created_by=admin,
        )
        project_data = Project.objects.create(
            name="Enterprise Analytics Foundation",
            description=(
                "Establish governed reporting datasets and executive operations "
                "dashboards."
            ),
            manager=employees["employee2"],
            start_date=today - timedelta(days=15),
            end_date=today + timedelta(days=210),
            status=Project.Status.PLANNING,
            created_by=admin,
        )
        Task.objects.create(
            project=project_platform,
            assigned_to=employees["employee"],
            title="Complete platform service boundary review",
            description="Document service ownership, interfaces, and dependencies.",
            deadline=today + timedelta(days=14),
            status=Task.Status.IN_PROGRESS,
            created_by=admin,
        )
        Task.objects.create(
            project=project_platform,
            assigned_to=manager,
            title="Approve phased migration plan",
            description="Review sequencing, rollout safeguards, and acceptance criteria.",
            deadline=today + timedelta(days=21),
            status=Task.Status.TODO,
            created_by=admin,
        )
        Task.objects.create(
            project=project_data,
            assigned_to=employees["employee2"],
            title="Inventory priority reporting sources",
            description="Record business owners and refresh expectations for each source.",
            deadline=today + timedelta(days=30),
            status=Task.Status.TODO,
            created_by=admin,
        )

        laptop = Asset.objects.create(
            asset_name="Lenovo ThinkPad T14 Gen 5",
            category="Laptop",
            serial_number="NSG-LTP-2026-001",
            purchase_date=today - timedelta(days=90),
            status=Asset.Status.ALLOCATED,
            created_by=admin,
        )
        monitor = Asset.objects.create(
            asset_name="Dell UltraSharp 27-inch Monitor",
            category="Monitor",
            serial_number="NSG-MON-2026-001",
            purchase_date=today - timedelta(days=60),
            status=Asset.Status.AVAILABLE,
            created_by=admin,
        )
        phone = Asset.objects.create(
            asset_name="Apple iPhone 16",
            category="Mobile",
            serial_number="NSG-MOB-2026-001",
            purchase_date=today - timedelta(days=30),
            status=Asset.Status.ALLOCATED,
            created_by=admin,
        )
        for asset, employee, event in (
            (laptop, employees["employee"], "Allocated"),
            (phone, manager, "Allocated"),
        ):
            AssetAllocation.objects.create(
                asset=asset,
                employee=employee,
                allocation_date=today - timedelta(days=30),
                status=AssetAllocation.Status.ALLOCATED,
                created_by=admin,
            )
            AssetHistory.objects.create(
                asset=asset,
                employee=employee,
                event_type=event,
                event_date=now - timedelta(days=30),
                remarks="Issued as part of standard role-based equipment provisioning.",
                created_by=admin,
            )
        AssetHistory.objects.create(
            asset=monitor,
            employee=None,
            event_type="Received",
            event_date=now - timedelta(days=60),
            remarks="Received into the Pune Technology Campus inventory.",
            created_by=admin,
        )

        leave_types = {
            "Annual Leave": LeaveType.objects.create(
                name="Annual Leave",
                description="Paid annual leave for rest and personal commitments.",
                is_paid=True,
                is_active=True,
                created_by=admin,
            ),
            "Sick Leave": LeaveType.objects.create(
                name="Sick Leave",
                description="Paid leave for illness and medical recovery.",
                is_paid=True,
                is_active=True,
                created_by=admin,
            ),
            "Personal Leave": LeaveType.objects.create(
                name="Personal Leave",
                description="Leave for essential personal responsibilities.",
                is_paid=False,
                is_active=True,
                created_by=admin,
            ),
        }
        year = today.year
        for leave_type, allowance, carry_forward in (
            (leave_types["Annual Leave"], 24, True),
            (leave_types["Sick Leave"], 10, False),
            (leave_types["Personal Leave"], 5, False),
        ):
            LeavePolicy.objects.create(
                company=company,
                leave_type=leave_type,
                year=year,
                annual_allowance=allowance,
                carry_forward_allowed=carry_forward,
                max_carry_forward=5 if carry_forward else 0,
                requires_approval=True,
                is_active=True,
                created_by=admin,
            )
        for employee in employees.values():
            for leave_type, allowance in (
                (leave_types["Annual Leave"], 24),
                (leave_types["Sick Leave"], 10),
                (leave_types["Personal Leave"], 5),
            ):
                LeaveBalance.objects.create(
                    employee=employee,
                    company=company,
                    leave_type=leave_type,
                    year=year,
                    allocated=allowance,
                    used=0,
                    carried_forward=0,
                    created_by=admin,
                )
        LeaveRequest.objects.create(
            employee=employees["employee"],
            leave_type=leave_types["Annual Leave"],
            start_date=today + timedelta(days=20),
            end_date=today + timedelta(days=22),
            reason="Pre-planned family travel.",
            status=LeaveRequest.Status.PENDING,
            created_by=admin,
        )
        LeaveRequest.objects.create(
            employee=employees["employee2"],
            leave_type=leave_types["Personal Leave"],
            start_date=today - timedelta(days=14),
            end_date=today - timedelta(days=14),
            reason="Personal appointment.",
            status=LeaveRequest.Status.APPROVED,
            reviewed_by=admin,
            reviewer_comment="Approved by the People Operations team.",
            reviewed_at=now - timedelta(days=20),
            created_by=admin,
        )

        categories = {
            "Travel": ExpenseCategory.objects.create(
                name="Business Travel",
                description="Business travel and local transportation.",
                is_active=True,
                created_by=admin,
            ),
            "Meals": ExpenseCategory.objects.create(
                name="Client and Team Meals",
                description="Business meals with supporting documentation.",
                is_active=True,
                created_by=admin,
            ),
            "Equipment": ExpenseCategory.objects.create(
                name="Work Equipment",
                description="Pre-approved role-related equipment and accessories.",
                is_active=True,
                created_by=admin,
            ),
        }
        Expense.objects.create(
            employee=employees["employee"],
            category=categories["Travel"],
            amount="1840.50",
            expense_date=today - timedelta(days=5),
            description="Intercity travel for the customer platform planning workshop.",
            status="PENDING",
            created_by=admin,
        )
        Expense.objects.create(
            employee=employees["manager"],
            category=categories["Meals"],
            amount="3260.00",
            expense_date=today - timedelta(days=18),
            description="Customer discovery meeting with the regional delivery team.",
            status="APPROVED",
            approved_by=admin,
            approved_at=now - timedelta(days=12),
            remarks="Receipt reviewed and approved.",
            created_by=admin,
        )
        Expense.objects.create(
            employee=employees["employee2"],
            category=categories["Equipment"],
            amount="2450.00",
            expense_date=today - timedelta(days=9),
            description="Approved ergonomic keyboard for the product research desk.",
            status="PENDING",
            created_by=admin,
        )

        lines = [
            "Northstar Enterprise Group - Seed Account Credentials",
            "Generated for this seed run. Change each password after first login.",
            (
                "The existing erp_admin account and password were preserved; "
                "its password is not included."
                if not admin_created
                else "This command created erp_admin with a generated password."
            ),
            "",
        ]
        for account in accounts:
            lines.extend(
                (
                    f"Username: {account['username']}",
                    f"Password: {account['password']}",
                    f"Role: {account['role']}",
                    f"Email: {account['email']}",
                    "",
                )
            )
        credentials_text = "\n".join(lines)
        transaction.on_commit(
            lambda: self._write_credentials(credentials_path, credentials_text)
        )

        self.stdout.write(
            self.style.SUCCESS(
                "ERP data seeded. Existing erp_admin and role rows were preserved; "
                "missing seed roles and the admin account were created when needed."
            )
        )
        self.stdout.write(
            f"Created {len(accounts)} user accounts, "
            f"{len(employees)} employees, 2 projects, and 3 assets."
        )
        self.stdout.write(f"Credentials will be written to {credentials_path} after commit.")

    @staticmethod
    def _clear_existing_data():
        models_in_delete_order = (
            Expense,
            ExpenseCategory,
            LeaveRequest,
            LeaveBalance,
            LeavePolicy,
            LeaveType,
            AssetHistory,
            AssetAllocation,
            Asset,
            Task,
            Project,
        )
        for model in models_in_delete_order:
            model.all_objects.all().delete()

        User.all_objects.exclude(username="erp_admin").delete()

        organization_models = (Team, Department, Branch, Company)
        for model in organization_models:
            model.all_objects.all().delete()

    @staticmethod
    def _write_credentials(path, contents):
        try:
            with path.open("x", encoding="utf-8", newline="\n") as credentials_file:
                credentials_file.write(contents)
        except OSError as error:
            raise CommandError(
                f"Seed data committed, but credentials could not be written to {path}: "
                f"{error}"
            ) from error
